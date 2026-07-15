"""Keep append-only audit history when users are deleted.

Revision ID: 20260715_0011
Revises: 20260715_0010
"""

from alembic import op

revision = "20260715_0011"
down_revision = "20260715_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Audit rows retain UUID snapshots and actor_email in details. FK actions
    # would either block account deletion or mutate an append-only row.
    op.execute("ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_actor_user_id_fkey")
    op.execute("ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_target_user_id_fkey")


def downgrade() -> None:
    raise RuntimeError("Downgrade is intentionally irreversible: deleted accounts cannot satisfy audit foreign keys")