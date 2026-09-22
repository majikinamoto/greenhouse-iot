#!/usr/bin/env bash
# Installed outside the web root by setup-production-deploy.sh.
set -euo pipefail
export GIT_TERMINAL_PROMPT=0

if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
    echo 'Only deploy <commit SHA> is allowed.' >&2
    exit 1
fi
deploy_sha=${BASH_REMATCH[1]}

mkdir -p "$HOME/.local/state"
exec 9>"$HOME/.local/state/greenhouse-deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

cd /var/www/html
[[ $(git rev-parse --show-toplevel) == /var/www/html ]]
[[ $(git branch --show-current) == main ]] || {
    echo 'The production branch must be main.' >&2
    exit 1
}
if [[ -n $(git status --porcelain --untracked-files=no) ]]; then
    echo 'Tracked files have local changes; deployment stopped.' >&2
    exit 1
fi

git fetch origin main
git cat-file -e "$deploy_sha^{commit}"
git merge-base --is-ancestor "$deploy_sha" refs/remotes/origin/main || {
    echo 'The requested commit is not part of origin/main.' >&2
    exit 1
}
git merge-base --is-ancestor HEAD "$deploy_sha" || {
    echo 'Production has newer or divergent commits; deployment stopped.' >&2
    exit 1
}
git merge --ff-only "$deploy_sha"
[[ $(git rev-parse HEAD) == "$deploy_sha" ]]
git log -1 --format='Deployed: %h %s'
