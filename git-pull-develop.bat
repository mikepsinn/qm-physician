if not defined in_subprocess (cmd /k set in_subprocess=y ^& %0 %*) & exit )
echo Pruning tracked branches no longer on remote
git -c diff.mnemonicprefix=false -c core.quotepath=false fetch --prune origin
git checkout develop
git pull
pause