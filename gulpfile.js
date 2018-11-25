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
        },
        isLocal: function(){
            return qm.getReleaseStage() === "local";
        },
    },
    fileHelper: {
        loopThroughFilesInFolder: function(folderPath, callback, finalCallback){
            var files = fs.readdirSync(folderPath);
            for (var i = 0; i < files.length; i++) {
                var fileName = files[i];
                if(i === files.length -1){
                    callback(fileName, finalCallback);
                } else {
                    callback(fileName);
                }
            }
        },
        checkIfUrlExists: function (urls, callback) {
            var download2 = require('gulp-download2');
            return download2(urls, {
                errorCallback: function (code) {
                    if (code === 404) {
                        console.error('404 for '+this.uri);
                        process.exit(1);
                    } else if (code === 500) {
                        console.error('Fatal exception :(');
                        process.exit(1);
                    }
                }
            }).pipe(gulp.dest('./log'));
        },
        writeToFileWithCallback: function(filePath, stringContents, callback) {
            if(!stringContents){
                throw filePath + " stringContents not provided to writeToFileWithCallback";
            }
            qmLog.info("Writing to " + filePath);
            if(typeof stringContents !== "string"){stringContents = JSON.stringify(stringContents);}
            return fs.writeFile(filePath, stringContents, callback);
        },
        outputFileContents: function(path){
            qmLog.info(path+": "+fs.readFileSync(path))
        }
    },
    paths: {
        minifiedScripts: "ionic/www",
        //minifiedScripts: "ionic/www/scripts"
    },
    chcp: {
        /** @namespace process.env.S3_PREFIX */
        s3Prefix: "",
        checkAwsEnvs: function() {
            if(!process.env.AWS_ACCESS_KEY_ID){
                qmLog.info("Please set environmental variable AWS_ACCESS_KEY_ID");
                return false;
            }
            if(!process.env.AWS_SECRET_ACCESS_KEY){
                qmLog.info("Please set environmental variable AWS_SECRET_ACCESS_KEY");
                return false;
            }
            return true;
        },
        loginBuildAndDeploy: function(callback){
            qm.chcp.loginAndBuild(function(){
                qm.chcp.outputCordovaHcpJson();
                qmLog.info("For some reason, you have to run cordova-hcp deploy manually in the console instead of in gulp task");
                callback();
                process.exit(0);
                //execute("cordova-hcp deploy", callback, false, true);  // Causes stdout maxBuffer exceeded error
            });
        },
        loginAndBuild: function(callback){
            /** @namespace qm.getAppSettings().additionalSettings.appIds.appleId */
            var chcp = {
                "name": "QuantiModo",
                "s3bucket": qm.chcp.getS3Bucket(),
                "s3region": "us-east-1",
                "s3prefix": qm.chcp.s3Prefix,
                //"ios_identifier": qmGulp.getAppIds().appleId,
                //"android_identifier": qmGulp.getAppIdentifier(),
                "update": "start",
                "content_url": qm.chcp.getContentUrl()
            };
            qm.fileHelper.writeToFileWithCallback('cordova-hcp.json', qmLog.prettyJSONStringify(chcp), function(err){
                if(err) {return qmLog.error(err);}
                var chcpBuildOptions = {};
                return qm.fileHelper.writeToFileWithCallback('chcpbuild.options', qmLog.prettyJSONStringify(chcpBuildOptions), function(err){
                    if(err) {return qmLog.error(err);}
                    qm.chcp.chcpLogin(function(err){
                        if(err) {return qmLog.error(err);}
                        qm.chcp.outputCordovaHcpJson();
                        execute("cordova-hcp build "+qm.chcp.s3Prefix, callback);
                    });
                });
            });
        },
        outputCordovaHcpJson: function() {
            qm.fileHelper.outputFileContents('cordova-hcp.json');
        },
        chcpLogin: function (callback){
            if(!qm.chcp.checkAwsEnvs()){throw "Cannot upload to S3. Please set environmental variable AWS_SECRET_ACCESS_KEY";}
            /** @namespace process.env.AWS_ACCESS_KEY_ID */
            /** @namespace process.env.AWS_SECRET_ACCESS_KEY */
            var string = '{"key": "' + process.env.AWS_ACCESS_KEY_ID + ' ", "secret": "' + process.env.AWS_SECRET_ACCESS_KEY +'"}';
            return qm.fileHelper.writeToFileWithCallback(paths.chcpLogin, string, callback);
        },
        getS3HostName: function(){
            return"https://"+qm.chcp.getS3Bucket()+".s3.amazonaws.com/";
        },
        getContentUrl: function(){
            return qm.chcp.getS3HostName()+qm.chcp.s3Prefix;
        },
        getS3Bucket: function(){
            if(process.env.PWD && process.env.PWD.indexOf('workspace/DEPLOY-staging') !== -1){return "qm-staging.quantimo.do";}
            if(process.env.PWD && process.env.PWD.indexOf('workspace/DEPLOY-production') !== -1){return "quantimodo.quantimo.do";}
            return "qm-dev.quantimo.do";
        }
    },
    buildSettings: {
        getDoNotMinify: function(){
            return doNotMinify;
        },
        setDoNotMinify: function(value){
            doNotMinify = value;
        },
        buildDebug: function () {
            if(isTruthy(process.env.BUILD_ANDROID_RELEASE)){return false;}
            if(isTruthy(process.env.BUILD_DEBUG) || isTruthy(process.env.DEBUG_BUILD)){
                qmLog.info("BUILD_DEBUG or DEBUG_BUILD is true");
                return true;
            }
            if(buildingFor.chrome()){return false;}  // Otherwise we don't minify and extension is huge
            if(!qmGit.isMaster()){
                qmLog.info("Not on master so buildDebug is true");
                return true;
            }
            return false;
        }
    }
};
var qmDB = {
    mongo: {
        dbSettings: {
            development: {
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'quantimodo_test',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || 'caf4a081d8e0773617886cc54b801cbec3ace4c455917c9c',
                port: process.env.DB_PORT || '3307',
            },
            production: {
                host: '169.61.123.138:27017/',
                database: 'admin',
                user: 'quantimodo',
                password: 'PxS5eX8AlhSG',
                port: '3306',
                ssl  : {
                    cert: fs.readFileSync(__dirname + '/docker/mysql/client/client-cert.pem'),
                    ca : fs.readFileSync(__dirname + '/docker/mysql/conf.d/ca.pem'),
                    key : fs.readFileSync(__dirname + '/docker/mysql/client/client-key.pem')
                }
            }
        },
        collections: {
            connectorData: function () {
                var collection = qmDB.mongo.db.collection('connectorData');
                return collection;
            }
        },
        initialize: function () {
            var MongoClient = require('mongodb').MongoClient;
            var assert = require('assert');
            var connectionUrl = 'mongodb://quantimodo:PxS5eX8AlhSG@169.61.123.138:27017/admin';
            var dbName = 'quantimodo';
            MongoClient.connect(connectionUrl, function(err, client) {  // Use connect method to connect to the server
                assert.equal(null, err);
                console.log("Connected successfully to " + connectionUrl);
                qmDB.mongo.db = client.db(dbName);
                client.close();
            });
        }
    }
};
var pathToModo = './ionic';
var configurationIndexHtml = 'configuration-index.html';
var configurationAppJs = 'configuration-app.js';
var paths = {
    src: {
        path: pathToModo + '/src',
        appDesignerIndexHtml: pathToModo + '/src/' + configurationIndexHtml,
        configurationAppJs: pathToModo + '/src/js/' + configurationAppJs
    },
    www: {
        path: pathToModo + '/www',
        appDesignerIndexHtml: pathToModo + '/www/' + configurationIndexHtml,
        configurationAppJs: pathToModo + '/www/js/' + configurationAppJs
    },
    studyBaseUrl: 'https://utopia.quantimo.do:4470/ionic/Modo/src/#/app/study?',
    screenshots: 'public.built/tmp',
    chcpLogin: '.chcplogin'
};
var bugsnag = require("bugsnag");
var clean = require('gulp-rimraf');
var git = require('gulp-git');
var gulp = require('gulp');
var gutil = require('gulp-util');
var rename = require('gulp-rename');
var replace = require('gulp-string-replace');
var runSequence = require('run-sequence');
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
function isTruthy(value) {return (value && value !== "false");}
var buildDebug = isTruthy(process.env.BUILD_DEBUG);
var majorMinorVersionNumbers = '5.8.';
function getPatchVersionNumber() {
    var date = new Date();
    var monthNumber = (date.getMonth() + 1).toString();
    var dayOfMonth = ('0' + date.getDate()).slice(-2);
    return monthNumber + dayOfMonth;
}
var apiVersionNumber = majorMinorVersionNumbers + getPatchVersionNumber();
var qmLog = {
    error: function (message, object, maxCharacters) {
        object = object || {};
        console.error(qmLog.obfuscateStringify(message, object, maxCharacters));
        //object.build_info = qm.buildInfoHelper.getCurrentBuildInfo();
        bugsnag.notify(new Error(qmLog.obfuscateStringify(message), obfuscateSecrets(object)));
    },
    info: function (message, object, maxCharacters) {console.log(qmLog.obfuscateStringify(message, object, maxCharacters));},
    debug: function (message, object, maxCharacters) {
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
            objectString = ':  ' + prettyJSONStringify(object);
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
qmLog.info("API version is " + apiVersionNumber);
try {
    qmDB.mongo.initialize();
} catch (e) {
    qmLog.error("Could not initialize MongoDB because "+JSON.stringify(e));
}
function execute(command, callback, suppressErrors, lotsOfOutput) {
    qmLog.debug('executing ' + command);
    if(lotsOfOutput){
        var arguments = command.split(" ");
        var program = arguments.shift();
        var ps = spawn(program, arguments);
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
function prettyJSONStringify(object) {return JSON.stringify(object, null, 2);}
function executeCommand(command, callback) {
    qmLog.info(command);
    var exec = require('child_process').exec;
    exec(command, function (err, stdout, stderr) {
        qmLog.info(stdout);
        if(stderr){qmLog.error(stderr);}
        if(callback){callback(err);}
    });
}
function cleanFiles(filesArray) {
    qmLog.info("Cleaning " + JSON.stringify(filesArray) + '...');
    return gulp.src(filesArray, {read: false}).pipe(clean());
}
gulp.task('default', [], function (callback) {
    runSequence(
        'deleteSuccessFile',
        'minify-qm-url-updater',
        //'configureIonicApp',  // Done in composer.json so we can see the output
        'updateModulesInAppJs',
        'app-designer-index',
        'copy-app-designer-index-to-www',
        'copy-configuration-app-js-to-www',
        'copySrcLibToWww',
        'copySrcJsToWww',
        'createSuccessFile',
        function (error) {
            if (error) {qmLog.error(error.message);} else {qmLog.info('Gulp build of app builder site finished successfully!');}
            callback(error);
        });
});
gulp.task('createSuccessFile', function () {
    writeToFile('lastCommitBuilt', qmGit.getCurrentGitCommitSha());
    return fs.writeFileSync('success');
});
gulp.task('deleteSuccessFile', function () {return cleanFiles(['success']);});
function generateAppDesignerIndex(path) {
    console.log("MAKE SURE TO RUN cd ionic && yarn install BEFORE RUNNING THIS TASK!");
    var target = gulp.src(paths.src.path + '/index.html');
    // It's not necessary to read the files (will speed up things), we're only after their paths:
    var injectToInjectJsHtmlTag = gulp.src([
        './public.built/ionic/app-configuration/js/**/*.js',
        //'./public.built/ionic/app-configuration/js/**/*.css',  // TODO: Not sure why this is here?
        './public.built/ionic/app-configuration/lib/md-color-picker/dist/mdColorPicker.min.css',
        './public.built/ionic/app-configuration/lib/md-color-picker/dist/mdColorPicker.min.css',
        './public.built/ionic/app-configuration/lib/tinycolor/dist/tinycolor-min.js', // Must come before mdColorPicker.min.js
        './public.built/ionic/app-configuration/lib/md-color-picker/dist/mdColorPicker.min.js'
        //'./ionic/www/lib/ui-iconpicker/**/*.js',
        //'./ionic/www/lib/ui-iconpicker/**/*.css'
    ], {read: false});
    console.log("Saving " + configurationIndexHtml + " to " + path + '...');
    var inject = require('gulp-inject');
    return target.pipe(inject(injectToInjectJsHtmlTag))
    //.pipe(replace('<script src="', '<script src="Modo/www/'))
    //.pipe(replace(' href="', ' href="Modo/www/'))
        .pipe(replace('/public.built/ionic', '../..'))
        .pipe(replace('<script src="cordova.js"></script>', ''))
        .pipe(replace('js/app.js', 'js/' + configurationAppJs))
        .pipe(rename(configurationIndexHtml))
        .pipe(gulp.dest(path));
}
gulp.task('app-designer-index', [], function () {
    return generateAppDesignerIndex(paths.src.path);
    //return generateAppDesignerIndex(paths.www.path);
});
gulp.task('copy-app-designer-index-to-www', [], function () {
    return copyFiles(paths.src.appDesignerIndexHtml, paths.www.path);
});
gulp.task('copy-configuration-app-js-to-www', [], function () {
    return copyFiles(paths.src.configurationAppJs, paths.www.path);
});
function copyFiles(sourceFiles, destinationPath, excludedFolder) {
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
gulp.task('copySrcLibToWww', [], function () {
    return copyFiles(paths.src.path + '/lib/**/*', paths.www.path + '/lib');
});
gulp.task('copySrcJsToWww', [], function () {
    return copyFiles(paths.src.path + '/js/**/*', paths.www.path + '/js');
});
gulp.task('copyCustomLibToSrc', [], function () {
    return copyFiles(paths.src.path + '/js/**/*', paths.www.path + '/js');
});
gulp.task('copySrcToWww', [], function () {
    return copyFiles(paths.src.path + '/**/*', paths.www.path);
});
gulp.task('watch', function() {
    gulp.watch('./public.built/ionic/app-configuration/**/*', ['copy']);
});
gulp.task('copy', function() {
    if (!fs.existsSync('./ionic/www/configuration')){fs.mkdirSync('./ionic/www/configuration');}
    gulp.src('./public.built/ionic/app-configuration/**/*')
        .pipe(gulp.dest('./ionic/www/configuration'));
});
gulp.task('changelog', function () {
    var conventionalChangelog = require('gulp-conventional-changelog');
    return gulp.src('CHANGELOG.md', {
        buffer: false
    })
        .pipe(conventionalChangelog({
            preset: 'angular' // Or to any other commit message convention you use.
        }))
        .pipe(gulp.dest('./'));
});
gulp.task('github-release', function(done) {
    var conventionalGithubReleaser = require('conventional-github-releaser');
    conventionalGithubReleaser({
        type: "oauth",
        token: '0126af95c0e2d9b0a7c78738c4c00a860b04acc8' // change this to your own GitHub token or use an environment variable
    }, {
        preset: 'angular' // Or to any other commit message convention you use.
    }, done);
});
gulp.task('bump-version', function () {
    var bump = require('gulp-bump');
// We hardcode the version change type to 'patch' but it may be a good idea to
// use minimist (https://www.npmjs.com/package/minimist) to determine with a
// command argument whether you are doing a 'major', 'minor' or a 'patch' change.
    return gulp.src(['./bower.json', './package.json'])
        .pipe(bump({type: "patch"}).on('error', gutil.log))
        .pipe(gulp.dest('./'));
});
gulp.task('commit-changes', function () {
    return gulp.src('.')
        .pipe(git.add())
        .pipe(git.commit('[Prerelease] Bumped version number'));
});
gulp.task('push-changes', function (cb) {
    git.push('origin', 'master', cb);
});
gulp.task('create-new-tag', function (cb) {
    var version = getPackageJsonVersion();
    git.tag(version, 'Created Tag for version: ' + version, function (error) {
        if (error) {
            return cb(error);
        }
        git.push('origin', 'master', {args: '--tags'}, cb);
    });
    function getPackageJsonVersion () {
        // We parse the json file instead of using require because require caches
        // multiple calls so the version number won't be updated
        return JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
    }
});
gulp.task('release', function (callback) {
    runSequence(
        'bump-version',
        'changelog',
        'commit-changes',
        'push-changes',
        'create-new-tag',
        'github-release',
        function (error) {
            if (error) {
                qmLog.error(error.message);
            } else {
                qmLog.info('RELEASE FINISHED SUCCESSFULLY');
            }
            callback(error);
        });
});
gulp.task('configureIonicApp', function (callback) {
    executeCommand('cd ' + pathToModo + ' && yarn install', callback);
});
gulp.task('bowerInstall', function (callback) {
    executeCommand('bower install --allow-root', callback);
});
gulp.task('updateModulesInAppJs', [], function () {
    var filesToUpdate = [
        paths.src.path+'/js/app.js'
    ];
    return gulp.src(filesToUpdate, {base: '.'})
        .pipe(replace("'ionic',", "'ionic', 'mdColorPicker',"))
        .pipe(rename(configurationAppJs))
        .pipe(gulp.dest(paths.src.path+'/js'));
});
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};
function writeToFile(filePath, stringContents) {
    filePath = './' + filePath;
    qmLog.info("Writing to " + filePath);
    if(typeof stringContents !== "string"){stringContents = prettyJSONStringify(stringContents);}
    return fs.writeFileSync(filePath, stringContents);
}
try {
    var Quantimodo = require('quantimodo');
    authenticateQuantiModoSdk();
} catch (error) {
    qmLog.error(error);
}
var defaultClient;
function authenticateQuantiModoSdk() {
    defaultClient = Quantimodo.ApiClient.instance;
    if(process.env.APP_HOST_NAME){defaultClient.basePath = process.env.APP_HOST_NAME + '/api';}
    var quantimodo_oauth2 = defaultClient.authentications['quantimodo_oauth2'];
    var clientId = defaultClient.authentications['client_id'];
    clientId.apiKey = "testClient";
    if(process.env.TEST_ACCESS_TOKEN){
        qmLog.info("Using process.env.QUANTIMODO_ACCESS_TOKEN");
        quantimodo_oauth2.accessToken = process.env.TEST_ACCESS_TOKEN;
    } else {
        qmLog.info("Using test user access token");
        quantimodo_oauth2.accessToken = '42ff4170172357b7312bb127fb58d5ea464943c1';
    }
}
gulp.task('minify-integration-js', [], function() {
    qmLog.info("Running minify-integration-js...");
    var minify = require('gulp-minify');
    return gulp.src('public.built/qm-connect/integration.js')
        .pipe(minify({
            ext:{
                src:'.js',
                min:'.min.js'
            },
            exclude: ['tasks'],
            ignoreFiles: ['.combo.js', '-min.js']
        }))
        .pipe(gulp.dest('public.built/qm-connect'))
});
gulp.task('minify-qm-url-updater', [], function(callback) {
    qmLog.info("Running minify-qm-url-updater...");
    var minify = require('gulp-minify');
    var pump = require('pump');
    pump([
        gulp.src('custom-lib/*.js'),
        minify(),  // uglify doesn't work
        gulp.dest('public.built/dist')
    ], callback);
});
gulp.task('copy-qm-url-updater', [], function () {
    var destination = 'ionic/build/quantimodo-chrome-extension/js';
    destination = paths.src.path + '/js';
    return copyFiles('custom-lib/**/*', destination);
});
var qmGit = {
    branchName: process.env.CIRCLE_BRANCH || process.env.BUDDYBUILD_BRANCH || process.env.TRAVIS_BRANCH || process.env.GIT_BRANCH,
    isMaster: function () {
        return qmGit.branchName === "master"
    },
    isDevelop: function () {
        return qmGit.branchName === "develop"
    },
    isFeature: function () {
        return qmGit.branchName.indexOf("feature") !== -1;
    },
    getCurrentGitCommitSha: function () {
        if(process.env.SOURCE_VERSION){return process.env.SOURCE_VERSION;}
        try {
            return require('child_process').execSync('git rev-parse HEAD').toString().trim()
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
            })
        })
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
gulp.task('merge-dialogflow-export', function() {
    var agent = {entities: {}, intents: {}};
    var agentsPath = 'slim/data/agents';
    var agentPath = agentsPath + '/Dr-Modo';
    var entitiesPath = agentPath + '/entities';
    var entityFiles = fs.readdirSync(entitiesPath);
    for (var i = 0; i < entityFiles.length; i++) {
        var entityFileName = entityFiles[i];
        if(entityFileName.indexOf('entries') !== -1){continue;}
        var entityName = entityFileName.replace('.json', '');
        var entityPath = entitiesPath+ '/' + entityFileName;
        agent.entities[entityName] = JSON.parse(fs.readFileSync(entityPath));
        var entriesPath = entitiesPath+'/'+entityName+'_entries_en.json';
        agent.entities[entityName].entries = JSON.parse(fs.readFileSync(entriesPath));
    }
    var intentsPath = agentPath + '/intents';
    var intentFiles = fs.readdirSync(intentsPath);
    for (i = 0; i < intentFiles.length; i++) {
        var intentFileName = intentFiles[i];
        if(intentFileName.indexOf('usersays') !== -1){continue;}
        var intentName = intentFileName.replace('.json', '');
        var intentPath = intentsPath+ '/' + intentFileName;
        agent.intents[intentName] = JSON.parse(fs.readFileSync(intentPath));
        var usersaysPath = intentsPath+'/'+intentName+'_usersays_en.json';
        try {
            agent.intents[intentName].usersays = JSON.parse(fs.readFileSync(usersaysPath));
        } catch (e) {
            qmLog.info(e.message);
        }
    }
    return writeToFile(agentsPath+'/dr-modo-agent.json', agent);
});
gulp.task('make-sure-scripts-got-deployed', function(callback) {
    var urls = [];
    var host = "https://quantimodo.quantimo.do";
    var files = fs.readdirSync(qm.paths.minifiedScripts);
    for (var i = 0; i < files.length; i++) {
        var fileName = files[i];
        if(fileName.indexOf('.html') === -1){continue;}
        var path = "/ionic/Modo/www/" +fileName;
        var url = host + path;
        urls.push()
    }
    qm.fileHelper.checkIfUrlExists(urls, callback);
});
gulp.task('chcp-config-and-deploy-web', [], function (callback) {
    qm.chcp.loginBuildAndDeploy(callback);
});