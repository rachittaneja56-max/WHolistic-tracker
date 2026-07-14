"""Add Better Auth, tenant ownership, invitations, quotas, and admin operations.

This migration is intentionally irreversible because deployment requires an explicit
application-data reset before it can run.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260714_0005"
down_revision = "20260712_0004"
branch_labels = None
depends_on = None

TENANT_TABLES = (
    "entities",
    "links",
    "sessions",
    "reviews",
    "comprehension_checks",
    "assistant_threads",
    "assistant_messages",
    "assistant_proposals",
    "integration_clients",
    "app_settings",
)


def _assert_empty() -> None:
    connection = op.get_bind()
    populated = []
    for table in TENANT_TABLES:
        count = connection.execute(sa.text(f'SELECT count(*) FROM public."{table}"')).scalar_one()
        if count:
            populated.append(f"{table}={count}")
    if populated:
        raise RuntimeError(
            "Multi-user migration requires an explicit data reset first; populated tables: "
            + ", ".join(populated)
        )


def _auth_tables() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS auth")
    op.create_table(
        "user",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("pg_catalog.gen_random_uuid()"), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("emailVerified", sa.Boolean(), nullable=False),
        sa.Column("image", sa.Text()),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("role", sa.Text()),
        sa.Column("banned", sa.Boolean()),
        sa.Column("banReason", sa.Text()),
        sa.Column("banExpires", sa.TIMESTAMP(timezone=True)),
        schema="auth",
    )
    op.create_table(
        "session",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("pg_catalog.gen_random_uuid()"), primary_key=True),
        sa.Column("expiresAt", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("token", sa.Text(), nullable=False, unique=True),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("ipAddress", sa.Text()),
        sa.Column("userAgent", sa.Text()),
        sa.Column("userId", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("impersonatedBy", sa.Text()),
        schema="auth",
    )
    op.create_index("session_userId_idx", "session", ["userId"], schema="auth")
    op.create_table(
        "account",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("pg_catalog.gen_random_uuid()"), primary_key=True),
        sa.Column("accountId", sa.Text(), nullable=False),
        sa.Column("providerId", sa.Text(), nullable=False),
        sa.Column("userId", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("accessToken", sa.Text()),
        sa.Column("refreshToken", sa.Text()),
        sa.Column("idToken", sa.Text()),
        sa.Column("accessTokenExpiresAt", sa.TIMESTAMP(timezone=True)),
        sa.Column("refreshTokenExpiresAt", sa.TIMESTAMP(timezone=True)),
        sa.Column("scope", sa.Text()),
        sa.Column("password", sa.Text()),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), nullable=False),
        schema="auth",
    )
    op.create_index("account_userId_idx", "account", ["userId"], schema="auth")
    op.create_table(
        "verification",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("pg_catalog.gen_random_uuid()"), primary_key=True),
        sa.Column("identifier", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("expiresAt", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updatedAt", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        schema="auth",
    )
    op.create_index("verification_identifier_idx", "verification", ["identifier"], schema="auth")
    op.create_table(
        "jwks",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("pg_catalog.gen_random_uuid()"), primary_key=True),
        sa.Column("publicKey", sa.Text(), nullable=False),
        sa.Column("privateKey", sa.Text(), nullable=False),
        sa.Column("createdAt", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("expiresAt", sa.TIMESTAMP(timezone=True)),
        schema="auth",
    )
    op.create_table(
        "rateLimit",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("pg_catalog.gen_random_uuid()"), primary_key=True),
        sa.Column("key", sa.Text(), nullable=False, unique=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("lastRequest", sa.BigInteger(), nullable=False),
        schema="auth",
    )


def _tenant_columns() -> None:
    for table in TENANT_TABLES:
        op.add_column(table, sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False))
        op.create_foreign_key(f"fk_{table}_auth_user", table, "user", ["user_id"], ["id"], source_schema="public", referent_schema="auth", ondelete="CASCADE")
        op.create_index(f"ix_{table}_user_id", table, ["user_id"])

    op.drop_constraint("app_settings_pkey", "app_settings", type_="primary")
    op.create_primary_key("app_settings_pkey", "app_settings", ["user_id", "key"])

    for table in ("entities", "links", "sessions", "reviews", "comprehension_checks", "assistant_threads", "assistant_messages", "assistant_proposals"):
        op.create_unique_constraint(f"uq_{table}_user_id_id", table, ["user_id", "id"])

    op.drop_constraint("entities_parent_id_fkey", "entities", type_="foreignkey")
    op.create_foreign_key("fk_entities_owned_parent", "entities", "entities", ["user_id", "parent_id"], ["user_id", "id"], ondelete="CASCADE")
    for name, column in (("from", "from_id"), ("to", "to_id")):
        op.drop_constraint(f"links_{column}_fkey", "links", type_="foreignkey")
        op.create_foreign_key(f"fk_links_owned_{name}", "links", "entities", ["user_id", column], ["user_id", "id"], ondelete="CASCADE")
    for table in ("sessions", "reviews", "comprehension_checks"):
        op.drop_constraint(f"{table}_entity_id_fkey", table, type_="foreignkey")
        op.create_foreign_key(f"fk_{table}_owned_entity", table, "entities", ["user_id", "entity_id"], ["user_id", "id"], ondelete="CASCADE")
    op.drop_constraint("assistant_messages_thread_id_fkey", "assistant_messages", type_="foreignkey")
    op.create_foreign_key("fk_messages_owned_thread", "assistant_messages", "assistant_threads", ["user_id", "thread_id"], ["user_id", "id"], ondelete="CASCADE")
    op.drop_constraint("assistant_proposals_thread_id_fkey", "assistant_proposals", type_="foreignkey")
    op.drop_constraint("assistant_proposals_source_message_id_fkey", "assistant_proposals", type_="foreignkey")
    op.create_foreign_key("fk_proposals_owned_thread", "assistant_proposals", "assistant_threads", ["user_id", "thread_id"], ["user_id", "id"], ondelete="CASCADE")
    op.create_foreign_key("fk_proposals_owned_message", "assistant_proposals", "assistant_messages", ["user_id", "source_message_id"], ["user_id", "id"], ondelete="CASCADE")


def _admin_tables() -> None:
    user_fk = sa.ForeignKey("auth.user.id", ondelete="CASCADE")
    op.create_table(
        "invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.Text(), nullable=False, index=True),
        sa.Column("token_hash", sa.Text(), nullable=False, unique=True),
        sa.Column("role", sa.Text(), server_default="user", nullable=False),
        sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), user_fk, nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("revoked_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_table(
        "user_quotas",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("max_entities", sa.Integer(), server_default="25000", nullable=False),
        sa.Column("max_assistant_messages", sa.Integer(), server_default="50000", nullable=False),
        sa.Column("max_ai_requests_per_day", sa.Integer(), server_default="200", nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_table(
        "usage_daily",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("entity_writes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("assistant_messages", sa.Integer(), server_default="0", nullable=False),
        sa.Column("ai_requests", sa.Integer(), server_default="0", nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("completion_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("integration_syncs", sa.Integer(), server_default="0", nullable=False),
        sa.Column("errors", sa.Integer(), server_default="0", nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_usage_daily_user_date"),
    )
    op.create_table(
        "admin_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="RESTRICT"), nullable=False, index=True),
        sa.Column("target_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="SET NULL"), index=True),
        sa.Column("action", sa.Text(), nullable=False, index=True),
        sa.Column("ip_address", sa.Text()),
        sa.Column("details", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False, index=True),
    )
    op.create_table(
        "system_settings",
        sa.Column("key", sa.Text(), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("auth.user.id", ondelete="SET NULL")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.execute(
        "INSERT INTO system_settings (key, value) VALUES "
        "('access', jsonb_build_object('invitations_enabled', true, 'login_enabled', true, 'invitation_expiry_hours', 72)), "
        "('default_quotas', jsonb_build_object('max_entities', 25000, 'max_assistant_messages', 50000, 'max_ai_requests_per_day', 200))"
    )


def upgrade() -> None:
    _assert_empty()
    _auth_tables()
    _tenant_columns()
    _admin_tables()


def downgrade() -> None:
    raise RuntimeError("The multi-user reset migration is intentionally irreversible.")
