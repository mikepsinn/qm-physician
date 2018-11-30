var fs = require('fs');
var qm = {
    getReleaseStage: function() {
        if(!process.env.HOSTNAME){return "local";}
        if(process.env.HOSTNAME.indexOf("local") !== -1){return "local";}
        if(process.env.HOSTNAME.indexOf("staging") !== -1){return "staging";}
        if(process.env.HOSTNAME.indexOf("app") !== -1){return "production";}
        if(process.env.HOSTNAME.indexOf("production") !== -1){return "production";}
        qmLog.error("Could not determine release stage!");
    },
    releaseStage: {
        isProduction: function(){
            return qm.getReleaseStage() === "production";
        },
        isStaging: function(){
            return qm.getReleaseStage() === "staging";
        }
    },
    fileHelper: {
        writeToFileWithCallback: function(filePath, stringContents, callback) {
            if(!stringContents){
                throw filePath + " stringContents not provided to writeToFileWithCallback";
            }
            qmLog.info("Writing to " + filePath);
            if(typeof stringContents !== "string"){stringContents = JSON.stringify(stringContents);}
            return fs.writeFile(filePath, stringContents, callback);
        },
        outputFileContents: function(path){
            qmLog.info(path+": "+fs.readFileSync(path));
        },
        cleanFiles: function(filesArray) {
            var clean = require('./src/ionic/node_modules/gulp-rimraf');
            qmLog.info("Cleaning " + JSON.stringify(filesArray) + '...');
            return gulp.src(filesArray, {read: false}).pipe(clean());
        },
        writeToFile: function(filePath, stringContents) {
            filePath = './' + filePath;
            qmLog.info("Writing to " + filePath);
            if(typeof stringContents !== "string"){stringContents = qm.stringHelper.prettyJSONStringify(stringContents);}
            return fs.writeFileSync(filePath, stringContents);
        },
        copyFiles: function(sourceFiles, destinationPath, excludedFolder) {
            console.log("Copying " + sourceFiles + " to " + destinationPath);
            var srcArray = [sourceFiles];
            if(excludedFolder){
                console.log("Excluding " + excludedFolder + " from copy.. ");
                srcArray.push('!' + excludedFolder);
                srcArray.push('!' + excludedFolder + '/**');
            }
            return gulp.src(srcArray)
                .pipe(gulp.dest(destinationPath));
        }
    },
    stringHelper: {
        prettyJSONStringify: function(object) {return JSON.stringify(object, null, 2);}
    }
};
var pathToModo = './src/ionic';
var bugsnag = require("./src/ionic/node_modules/bugsnag");
var gulp = require('gulp');
var runSequence = require('./src/ionic/node_modules/run-sequence').use(gulp);
bugsnag.register("ae7bc49d1285848342342bb5c321a2cf");
process.on('unhandledRejection', function (err) {
    console.error("Unhandled rejection: " + (err && err.stack || err));
    bugsnag.notify(err);
});
bugsnag.onBeforeNotify(function (notification) {
    var metaData = notification.events[0].metaData;
    // modify meta-data
    metaData.subsystem = { name: "Your subsystem name" };
});
var qmLog = {
    error: function (message, object, maxCharacters) {
        object = object || {};
        console.error(qmLog.obfuscateStringify(message, object, maxCharacters));
        //object.build_info = qm.buildInfoHelper.getCurrentBuildInfo();
        bugsnag.notify(new Error(qmLog.obfuscateStringify(message), obfuscateSecrets(object)));
    },
    info: function (message, object, maxCharacters) {console.log(qmLog.obfuscateStringify(message, object, maxCharacters));},
    debug: function (message, object, maxCharacters) {
        function isTruthy(value) {return (value && value !== "false");}
        var buildDebug = isTruthy(process.env.BUILD_DEBUG);
        if(buildDebug){qmLog.info("BUILD DEBUG: " + message, object, maxCharacters);}
    },
    logErrorAndThrowException: function (message, object) {
        qmLog.error(message, object);
        throw message;
    },
    obfuscateStringify: function (message, object) {
        var objectString = '';
        if(object){
            object = obfuscateSecrets(object);
            objectString = ':  ' + qm.stringHelper.prettyJSONStringify(object);
        }
        message += objectString;
        if(process.env.QUANTIMODO_CLIENT_SECRET){message = message.replace(process.env.QUANTIMODO_CLIENT_SECRET, 'HIDDEN');}
        if(process.env.AWS_SECRET_ACCESS_KEY){message = message.replace(process.env.AWS_SECRET_ACCESS_KEY, 'HIDDEN');}
        if(process.env.ENCRYPTION_SECRET){message = message.replace(process.env.ENCRYPTION_SECRET, 'HIDDEN');}
        if(process.env.QUANTIMODO_ACCESS_TOKEN){message = message.replace(process.env.QUANTIMODO_ACCESS_TOKEN, 'HIDDEN');}
        return message;
    },
    prettyJSONStringify: function(object) {return JSON.stringify(object, null, '\t');}
};
function execute(command, callback, suppressErrors, lotsOfOutput) {
    qmLog.debug('executing ' + command);
    if(lotsOfOutput){
        var args = command.split(" ");
        var program = args.shift();
        var spawn = require('child_process').spawn; // For commands with lots of output resulting in stdout maxBuffer exceeded error
        var ps = spawn(program, args);
        ps.on('exit', function (code, signal) {
            qmLog.info(command + ' exited with ' + 'code '+ code + ' and signal '+ signal);
            if(callback){callback();}
        });
        ps.stdout.on('data', function (data) {qmLog.info(command + ' stdout: ' + data);});
        ps.stderr.on('data', function (data) {qmLog.error(command + '  stderr: ' + data);});
        ps.on('close', function (code) {if (code !== 0) {qmLog.error(command + ' process exited with code ' + code);}});
    } else {
        var exec = require('child_process').exec;
        var my_child_process = exec(command, function (error, stdout, stderr) {
            if (error !== null) {if (suppressErrors) {qmLog.info('ERROR: exec ' + error);} else {qmLog.error('ERROR: exec ' + error);}}
            callback(error, stdout);
        });
        my_child_process.stdout.pipe(process.stdout);
        my_child_process.stderr.pipe(process.stderr);
    }
}
function obfuscateSecrets(object){
    if(typeof object !== 'object'){return object;}
    object = JSON.parse(JSON.stringify(object)); // Decouple so we don't screw up original object
    for (var propertyName in object) {
        if (object.hasOwnProperty(propertyName)) {
            var lowerCaseProperty = propertyName.toLowerCase();
            if(lowerCaseProperty.indexOf('secret') !== -1 || lowerCaseProperty.indexOf('password') !== -1 || lowerCaseProperty.indexOf('token') !== -1){
                object[propertyName] = "HIDDEN";
            } else {
                object[propertyName] = obfuscateSecrets(object[propertyName]);
            }
        }
    }
    return object;
}
var qmGit = {
    branchName: process.env.CIRCLE_BRANCH || process.env.BUDDYBUILD_BRANCH || process.env.TRAVIS_BRANCH || process.env.GIT_BRANCH,
    isMaster: function () {
        return qmGit.branchName === "master";
    },
    isDevelop: function () {
        return qmGit.branchName === "develop";
    },
    isFeature: function () {
        return qmGit.branchName.indexOf("feature") !== -1;
    },
    getCurrentGitCommitSha: function () {
        if(process.env.SOURCE_VERSION){return process.env.SOURCE_VERSION;}
        try {
            return require('child_process').execSync('git rev-parse HEAD').toString().trim();
        } catch (error) {
            qmLog.info(error);
        }
    },
    accessToken: process.env.GITHUB_ACCESS_TOKEN,
    getCommitMessage: function(callback){
        var commandForGit = 'git log -1 HEAD --pretty=format:%s';
        execute(commandForGit, function (error, output) {
            var commitMessage = output.trim();
            qmLog.info("Commit: "+ commitMessage);
            if(callback) {callback(commitMessage);}
        });
    },
    outputCommitMessageAndBranch: function () {
        qmGit.getCommitMessage(function (commitMessage) {
            qmGit.setBranchName(function (branchName) {
                qmLog.info("===== Building " + commitMessage + " on "+ branchName + " =====");
            });
        });
    },
    setBranchName: function(callback) {
        function setBranch(branch, callback) {
            qmGit.branchName = branch.replace('origin/', '');
            qmLog.info('current git branch: ' + qmGit.branchName);
            if (callback) {callback(qmGit.branchName);}
        }
        if (qmGit.branchName){
            setBranch(qmGit.branchName, callback);
            return;
        }
        try {
            var git = require('./src/ionic/node_modules/gulp-git');
            git.revParse({args: '--abbrev-ref HEAD'}, function (err, branch) {
                if(err){qmLog.error(err); return;}
                setBranch(branch, callback);
            });
        } catch (e) {
            qmLog.info("Could not set branch name because " + e.message);
        }
    }
};
qmGit.outputCommitMessageAndBranch();
gulp.task('default', [], function (callback) {
    runSequence(
        'deleteSuccessFile',
        'buildIonic',
        'appJs',
        'index',
        'copyTemplates',
        'copyImages',
        'createSuccessFile',
        //'clean-es5-ext',  Doesn't work
        'copy-src-to-www',
        function (error) {
            if (error) {qmLog.error(error.message);} else {qmLog.info('Gulp build of app builder site finished successfully!');}
            callback(error);
        });
});
gulp.task('createSuccessFile', function () {
    qm.fileHelper.writeToFile('log/lastCommitBuilt', qmGit.getCurrentGitCommitSha());
    return fs.writeFileSync('log/success');
});
gulp.task('deleteSuccessFile', function () {return qm.fileHelper.cleanFiles(['log/success']);});
gulp.task('index', [], function () {
    console.log("MAKE SURE TO RUN cd ionic && yarn install BEFORE RUNNING THIS TASK!");
    var target = gulp.src(pathToModo+'/src/index.html');
    // It's not necessary to read the files (will speed up things), we're only after their paths:
    var injectToInjectJsHtmlTag = gulp.src([
        '!./src/js/app.js',
        './src/js/**/*.js',
        './src/lib/md-color-picker/dist/mdColorPicker.min.css',
        './src/lib/md-color-picker/dist/mdColorPicker.min.css',
        './src/lib/tinycolor/dist/tinycolor-min.js', // Must come before mdColorPicker.min.js
        './src/lib/md-color-picker/dist/mdColorPicker.min.js'
    ], {read: false});
    var inject = require('gulp-inject');
    var replace = require('./src/ionic/node_modules/gulp-string-replace');
    return target.pipe(inject(injectToInjectJsHtmlTag))
        .pipe(replace('href="css', 'href="ionic/src/css'))
        .pipe(replace('src="custom-lib', 'src="ionic/src/custom-lib'))
        .pipe(replace('src="lib', 'src="ionic/src/lib'))
        .pipe(replace('src="data', 'src="ionic/src/data'))
        .pipe(replace('src="js', 'src="ionic/src/js'))
        .pipe(replace('<script src="cordova.js"></script>', ''))
        .pipe(replace('ionic/src/js/app.js', 'js/app.js'))
        .pipe(replace('src="/src/', 'src="'))
        .pipe(replace('href="/src/', 'href="'))
        .pipe(gulp.dest('./src'));
});
gulp.task('buildIonic', function (callback) {
    execute('cd ' + pathToModo + ' && yarn install', function(){
        execute('cd ' + pathToModo + ' && bower install', function(){
            execute('cd ' + pathToModo + ' && gulp', function(){
                qmLog.info("Done with buildIonic!");
                callback();
            });
        });
    });
});
gulp.task('appJs', [], function () {
    var filesToUpdate = [
        pathToModo+'/src/js/app.js'
    ];
    var replace = require('./src/ionic/node_modules/gulp-string-replace');
    return gulp.src(filesToUpdate)
        .pipe(replace("'ionic',", "'ionic', 'mdColorPicker',"))
        .pipe(replace("qm.appMode.isBuilder", "true || qm.appMode.isBuilder")) // For some reason we can't replace parenthesis?
        .pipe(gulp.dest('./src/js'));
});
gulp.task('copyTemplates', [], function () {
    return qm.fileHelper.copyFiles('src/ionic/src/templates/**/*', 'src/templates');
});
gulp.task('copyImages', [], function () {
    return qm.fileHelper.copyFiles('src/ionic/src/img/**/*', 'src/img');
});
gulp.task('copy-src-to-www', [], function () {
    return gulp.src([
        '!src/ionic/www',
        '!src/ionic/node_modules',
        'src/**/*'
    ]).pipe(gulp.dest('www'));
});
gulp.task('clean-es5-ext', [], function () {
    qmLog.info("Dealing with Invalid filename ionic/node_modules/es5-ext/test/string/#/plain-replace.js...");
    //return gulp.src('./**/*.js', { read: false }).pipe(rimraf());
    return qm.fileHelper.cleanFiles(['./src/ionic/node_modules/es5-ext/test/**/*'])
});