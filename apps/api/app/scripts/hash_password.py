from getpass import getpass
from pwdlib import PasswordHash


def main() -> None:
    password = getpass("Owner password: ")
    confirmation = getpass("Confirm owner password: ")
    if not password or password != confirmation:
        raise SystemExit("Passwords did not match or were empty")
    print(PasswordHash.recommended().hash(password))


if __name__ == "__main__":
    main()
