"""Add scoped DSA extension clients and LeetCode import uniqueness."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260712_0003"
down_revision = "20260711_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "integration_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("secret_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("scope", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_integration_clients_kind", "integration_clients", ["kind"])
    op.create_index("uq_entities_dsa_external_key", "entities", [sa.text("(metadata->'integration'->>'external_key')")], unique=True, postgresql_where=sa.text("type = 'dsa_problem' AND metadata->'integration'->>'external_key' IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("uq_entities_dsa_external_key", table_name="entities")
    op.drop_index("ix_integration_clients_kind", table_name="integration_clients")
    op.drop_table("integration_clients")
