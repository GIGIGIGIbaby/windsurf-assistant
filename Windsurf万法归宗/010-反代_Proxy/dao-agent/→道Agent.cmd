@echo off
:: 道·Agent Launcher — clears broken NODE_EXTRA_CA_CERTS before node starts
set NODE_EXTRA_CA_CERTS=
cd /d "%~dp0"
node dao_agent.js %*
