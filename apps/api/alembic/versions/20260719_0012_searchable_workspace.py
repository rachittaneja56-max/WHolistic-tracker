"""Add sortable timestamps and PostgreSQL FTS indexes."""

from alembic import op
import sqlalchemy as sa

revision = "20260719_0012"
down_revision = "20260715_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("entities", sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=True))
    op.execute("UPDATE entities SET updated_at = COALESCE(updated_at, created_at, now())")
    op.create_index("ix_entities_user_updated", "entities", ["user_id", "updated_at", "id"])
    op.create_index("ix_entities_user_created", "entities", ["user_id", "created_at", "id"])
    op.execute("CREATE INDEX ix_entities_search_tsv ON entities USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, '')))")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_entities_search_tsv")
    op.drop_index("ix_entities_user_created", table_name="entities")
    op.drop_index("ix_entities_user_updated", table_name="entities")
    op.drop_column("entities", "updated_at")
