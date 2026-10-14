#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the four Wira projects.
# Each project's vercel.json runs this from its own folder (frontend-user,
# frontend-mitra, frontend-admin, backend):
#     "ignoreCommand": "bash ../scripts/vercel-ignore-build.sh"
# Exit 0 = skip this build, exit 1 = build.
#
# Why: every push to main deployed all 4 projects, even when only one app (or
# only migrations/docs) changed, and the Hobby plan allows 100 deployments a
# day. A project now builds only when its own folder or the shared npm files
# (root package.json, package-lock.json, .npmrc) changed since that project's
# last successful deploy on this branch. When in doubt, it builds.

prev="$VERCEL_GIT_PREVIOUS_SHA"

# First deploy of a branch: nothing to compare against.
if [ -z "$prev" ]; then
  echo "No previous deployment on this branch: building."
  exit 1
fi

# Same commit again (manual redeploy): build.
if [ "$prev" = "$(git rev-parse HEAD)" ]; then
  echo "Redeploy of the same commit: building."
  exit 1
fi

# Vercel clones shallow; fetch the previous deploy's commit if it is missing.
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$prev" 2>/dev/null
fi
if ! git cat-file -e "$prev^{commit}" 2>/dev/null; then
  echo "Previous deployment commit $prev not available: building."
  exit 1
fi

if git diff --quiet "$prev" HEAD -- . ../package.json ../package-lock.json ../.npmrc; then
  echo "No changes for this project since $prev: skipping the build."
  exit 0
fi

echo "Changes for this project since $prev:"
git diff --stat "$prev" HEAD -- . ../package.json ../package-lock.json ../.npmrc | tail -5
exit 1
