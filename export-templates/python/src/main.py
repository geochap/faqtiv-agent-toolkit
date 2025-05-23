import os
from components.http_server import start_http_server
from components.cli_chat import start_cli_chat
from constants import ENV_VARS

for key, value in ENV_VARS.items():
    if key not in os.environ:
        os.environ[key] = value

if __name__ == "__main__":
    import pyfiglet
    import argparse

    print(pyfiglet.figlet_format("FAQtiv"), flush=True)

    parser = argparse.ArgumentParser(description="FAQtiv Agent CLI/HTTP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    args = parser.parse_args()

    if args.http:
        start_http_server()
    else:
        start_cli_chat() 