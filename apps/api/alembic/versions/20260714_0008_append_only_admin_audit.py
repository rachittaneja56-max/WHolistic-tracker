"""Make administrator audit records append-only.

Revision ID: 20260714_0008
Revises: 20260714_0007
"""

from alembic import op

revision = "20260714_0008"
down_revision = "20260714_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_admin_audit_mutation() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'administrator audit records are append-only';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER admin_audit_append_only BEFORE UPDATE OR DELETE ON admin_audit_logs
        FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_mutation();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS admin_audit_append_only ON admin_audit_logs")
    op.execute("DROP FUNCTION IF EXISTS prevent_admin_audit_mutation()")
