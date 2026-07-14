from __future__ import annotations

import argparse

from sqlalchemy import text

from app.db.session import engine

TENANT_TABLES = (
    "assistant_proposals",
    "assistant_messages",
    "assistant_threads",
    "comprehension_checks",
    "reviews",
    "sessions",
    "links",
    "entities",
    "integration_clients",
    "app_settings",
)
OPERATIONAL_TABLES = (
    "password_reset_tokens",
    "admin_audit_logs",
    "usage_daily",
    "user_quotas",
    "invitations",
    "system_settings",
)
AUTH_TABLES = (
    'auth."rateLimit"',
    "auth.jwks",
    "auth.verification",
    "auth.account",
    'auth."session"',
    'auth."user"',
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Permanently erase all Personal Dev KG application data.")
    parser.add_argument("--confirm", help="Pass WIPE to skip the interactive confirmation.")
    args = parser.parse_args()
    confirmation = args.confirm or input("This permanently deletes all application data. Type WIPE to continue: ")
    if confirmation != "WIPE":
        raise SystemExit("Reset cancelled.")

    with engine.begin() as connection:
        candidates = [f'public."{table}"' for table in (*TENANT_TABLES, *OPERATIONAL_TABLES)] + list(AUTH_TABLES)
        tables = [table for table in candidates if connection.execute(text("SELECT to_regclass(:table)"), {"table": table}).scalar_one()]
        counts = {table: connection.execute(text(f"SELECT count(*) FROM {table}")).scalar_one() for table in tables}
        table_list = ", ".join(tables)
        connection.execute(text(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE"))
        if 'public."system_settings"' in tables:
            connection.execute(text("INSERT INTO system_settings (key, value) VALUES ('access', jsonb_build_object('invitations_enabled', true, 'login_enabled', true, 'invitation_expiry_hours', 72)), ('default_quotas', jsonb_build_object('max_entities', 25000, 'max_assistant_messages', 50000, 'max_ai_requests_per_day', 200))"))
    print("Application and authentication data irreversibly erased (no backup was created):")
    for table, count in counts.items():
        print(f"  {table}: {count}")


if __name__ == "__main__":
    main()
