#!/usr/bin/env bash
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
SCRIPT_FOLDER=`dirname ${SCRIPT_PATH}` && cd ${SCRIPT_FOLDER} && cd ../.. && export BUILDER_PATH="$PWD" && export IONIC_PATH=${BUILDER_PATH}/ionic
echo "======================="
echo "Building Ionic Web App"
echo "======================="
cd ${BUILDER_PATH} && CURRENT_GIT_HASH=`git rev-parse @:./ionic` && lastCommitBuilt=`cat ${BUILDER_PATH}/log/ionic-last-commit-built`
echo "Previous IONIC commit built ${lastCommitBuilt} and CURRENT_GIT_HASH ${CURRENT_GIT_HASH}"
if [[ -z "$lastCommitBuilt" || ${CURRENT_GIT_HASH} != ${lastCommitBuilt} || ${REBUILD} == "1" ]]
    then
        cd ${IONIC_PATH}
        echo "Removing old combined/minified files.  It should already be done in gulp cleanCombinedFiles but it doesn't seem to be working"
        rm ${IONIC_PATH}/www/scripts/*
        echo "==== RUNNING npm install silently FOR IONIC APP ===="
        cd ${IONIC_PATH} && npm install --silent
        echo "==== RUNNING bower install --allow-root --quiet FOR IONIC APP ===="
        bower install --allow-root --quiet
        echo "==== RUNNING gulp configureAppAfterNpmInstall FOR IONIC APP ===="
        gulp configureAppAfterNpmInstall
        if [[ ! -f success ]]; then
            echo "===== IONIC BUILD FAILURE: Ionic success file does not exist so build did not complete! ====="
            exit 1
        fi
        echo ${CURRENT_GIT_HASH} > ${BUILDER_PATH}/log/ionic-last-commit-built
    else
        echo "Already built ${CURRENT_GIT_HASH}";
fi
echo "======================"
echo "Building App Designer"
echo "======================"
cd ${BUILDER_PATH} && CURRENT_GIT_HASH=$(git rev-parse HEAD) && lastCommitBuilt=`cat ${BUILDER_PATH}/log/qm-docker-last-commit-built`
echo "Previous QM-DOCKER commit built ${lastCommitBuilt} and CURRENT_GIT_HASH ${CURRENT_GIT_HASH}"
if [[ -z "$lastCommitBuilt" || ${CURRENT_GIT_HASH} != ${lastCommitBuilt} || ${REBUILD} == "1" ]]
    then
        echo "==== Running npm install silently for App Designer ===="
        npm install --silent
        echo "==== RUNNING bower install --allow-root for App Designer ===="
        bower install --allow-root --quiet
        gulp default
        test -e success || echo "===== QM-DOCKER BUILD FAILURE: Success file was not deleted so build did not complete! ====="
        test -e success || exit 1
        echo ${CURRENT_GIT_HASH} > ${BUILDER_PATH}/log/qm-docker-last-commit-built
    else
        echo "Already built ${CURRENT_GIT_HASH}";
fi