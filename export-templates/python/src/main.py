import argparse
import pyfiglet
import os
from components.http_server import start_http_server
from components.cli_chat import start_cli_chat
from constants import ENV_VARS

if __name__ == "__main__":    
    print(pyfiglet.figlet_format("FAQtiv"), flush=True)

    parser = argparse.ArgumentParser(description="FAQtiv Agent CLI/HTTP Server")
    parser.add_argument("--http", action="store_true", help="Run as HTTP server")
    args = parser.parse_args()

    for key, value in ENV_VARS.items():
        os.environ[key] = value

    if args.http:
        start_http_server()
    else:
        start_cli_chat()

