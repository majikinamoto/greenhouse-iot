#!/usr/bin/env bash
# Run once as ubuntu on production. Never prints the private key.
set -euo pipefail
umask 077

[[ $(id -un) == ubuntu && $HOME == /home/ubuntu ]] || {
    echo 'Run this script as ubuntu on the production server.' >&2
    exit 1
}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
command -v flock >/dev/null
[[ -r /etc/ssh/ssh_host_ed25519_key.pub ]]
bash -n "$script_dir/deploy-production.sh"

mkdir -p "$HOME/.ssh" "$HOME/.local/bin"
chmod 700 "$HOME/.ssh"
install -m 700 "$script_dir/deploy-production.sh" "$HOME/.local/bin/greenhouse-deploy"

key_path="$HOME/.ssh/greenhouse-actions"
if [[ ! -e "$key_path" && ! -e "$key_path.pub" ]]; then
    ssh-keygen -q -t ed25519 -N '' -C greenhouse-actions -f "$key_path"
fi
[[ -s "$key_path" && -s "$key_path.pub" ]]
public_key=$(cat "$key_path.pub")
auth_line="restrict,command=\"/home/ubuntu/.local/bin/greenhouse-deploy\" $public_key"
touch "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
if ! grep -qxF "$auth_line" "$HOME/.ssh/authorized_keys"; then
    printf '\n%s\n' "$auth_line" >> "$HOME/.ssh/authorized_keys"
fi

echo 'Setup complete. Register the two GitHub Actions secrets.'
echo 'PRODUCTION_SSH_KEY: copy the entire output of this command directly to GitHub (not to chat):'
echo 'cat ~/.ssh/greenhouse-actions'
echo 'PRODUCTION_KNOWN_HOSTS: copy the following public host-key line:'
awk '{print "163.43.29.108 " $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
