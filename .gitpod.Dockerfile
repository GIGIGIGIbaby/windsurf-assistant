FROM gitpod/workspace-node:latest
# dao-vm Gitpod Image · 印274
RUN sudo apt-get update -qq && sudo apt-get install -y -qq wget curl 2>/dev/null || true
