'''Make extension imports tenant-safe and refresh root-admin protection.

Revision ID: 20260715_0009
Revises: 20260714_0008
'''

from alembic import op


revision = '20260715_0009'
down_revision = '20260714_0008'
branch_labels = None
depends_on = None


ROOT_USER_TABLE = 'auth.' + chr(34) + 'user' + chr(34)
ROOT_PROTECTION_SQL = f'''
DROP TRIGGER IF EXISTS protect_root_admin ON {ROOT_USER_TABLE};
CREATE OR REPLACE FUNCTION auth.protect_root_admin() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'root_admin' THEN
    RAISE EXCEPTION 'the root administrator cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'root_admin' AND
     (NEW.email <> OLD.email OR NEW.role <> 'root_admin' OR COALESCE(NEW.banned, false)) THEN
    RAISE EXCEPTION 'the root administrator cannot be renamed, demoted, or banned';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_root_admin BEFORE INSERT OR UPDATE OR DELETE ON {ROOT_USER_TABLE}
FOR EACH ROW EXECUTE FUNCTION auth.protect_root_admin();
'''


def upgrade() -> None:
    op.execute('DROP INDEX IF EXISTS uq_entities_dsa_external_key')
    op.execute(
        '''
        CREATE UNIQUE INDEX uq_entities_dsa_external_key
        ON entities (user_id, (metadata->'integration'->>'external_key'))
        WHERE type = 'dsa_problem'
          AND metadata->'integration'->>'external_key' IS NOT NULL
        '''
    )
    # Fresh databases receive the generic function from 0006; this replacement
    # upgrades databases that already ran the original email-specific trigger.
    op.execute(ROOT_PROTECTION_SQL)


def downgrade() -> None:
    raise RuntimeError("Downgrade is intentionally irreversible after tenant-scoped DSA keys may exist")