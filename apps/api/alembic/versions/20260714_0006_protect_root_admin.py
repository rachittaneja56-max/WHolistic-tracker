"""Protect the immutable root administrator at the database boundary.

Revision ID: 20260714_0006
Revises: 20260714_0005
"""

from alembic import op

revision = "20260714_0006"
down_revision = "20260714_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION auth.protect_root_admin() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' AND lower(OLD.email) = 'rachittaneja56@gmail.com' THEN
            RAISE EXCEPTION 'the root administrator cannot be deleted';
          END IF;
          IF TG_OP = 'UPDATE' AND lower(OLD.email) = 'rachittaneja56@gmail.com' AND
             (lower(NEW.email) <> 'rachittaneja56@gmail.com' OR NEW.role <> 'root_admin' OR COALESCE(NEW.banned, false)) THEN
            RAISE EXCEPTION 'the root administrator cannot be renamed, demoted, or banned';
          END IF;
          IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.role = 'root_admin' AND lower(NEW.email) <> 'rachittaneja56@gmail.com' THEN
            RAISE EXCEPTION 'root_admin is reserved for rachittaneja56@gmail.com';
          END IF;
          RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER protect_root_admin BEFORE INSERT OR UPDATE OR DELETE ON auth."user"
        FOR EACH ROW EXECUTE FUNCTION auth.protect_root_admin();
        """
    )


def downgrade() -> None:
    op.execute('DROP TRIGGER IF EXISTS protect_root_admin ON auth."user"')
    op.execute("DROP FUNCTION IF EXISTS auth.protect_root_admin()")
