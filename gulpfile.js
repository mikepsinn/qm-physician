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
        minifiedScripts: "public.built/ionic/Modo/www",
        //minifiedScripts: "public.built/ionic/Modo/www/scripts"
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
        setDoNotMinify(value){
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
    },
};
var qmDB = {
    mysql: {
        production: function () {
            var knex = require('knex')({
                client: 'mysql',
                connection: qmDB.mysql.dbSettings.production
            });
            return knex;
        },
        dbSettings: {
            development: {
                host: process.env.DB_HOST || 'localhost',
                database: process.env.DB_NAME || 'quantimodo_test',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || 'caf4a081d8e0773617886cc54b801cbec3ace4c455917c9c',
                port: process.env.DB_PORT || '3307',
            },
            production: {
                host: '169.61.123.130',
                database: 'quantimodo',
                user: 'qm_production',
                password: 'caf4a081d8e0773617886cc54b801cbec3ace4c455917c9c',
                port: '3308',
                ssl  : {
                    cert: fs.readFileSync(__dirname + '/docker/mysql/client/client-cert.pem'),
                    ca : fs.readFileSync(__dirname + '/docker/mysql/conf.d/ca.pem'),
                    key : fs.readFileSync(__dirname + '/docker/mysql/client/client-key.pem')
                }
            }
        }
    },
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
var pathToModo = './public.built/ionic/Modo';
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
var zippedTestDbFilename = "quantimodo.zip";
var testDbFilename = "quantimodo.sql";
var pathToTestFixtures = "slim/tests/fixtures";
var pathToTestDatabase = pathToTestFixtures + "/" + testDbFilename;
var pathToZippedTestDatabase = pathToTestFixtures + "/" + zippedTestDbFilename;
var s3UrlToTestDatabase = "";
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
function replaceWords(source, destination) {
    return gulp.src(source)
        .pipe(replace("Human API", "{{$GLOBALS['HOST_APP_SETTINGS']->appDisplayName}}"))
        .pipe(replace("hub.humanapi.co/blog.html", "{{$GLOBALS['HOST_APP_SETTINGS']->homepageUrl}}"))
        .pipe(replace("http://support.humanapi.co/", "http://help.quantimo.do/"))
        .pipe(replace("Human Connect", "{{$GLOBALS['HOST_APP_SETTINGS']->appDisplayName}} Integration"))
        .pipe(replace("human-connect", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}-integration"))
        .pipe(replace("developer.humanapi.co", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/developer"))
        .pipe(replace("hub.humanapi.co", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/docs"))
        .pipe(replace("reference.humanapi.co", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/docs"))
        .pipe(replace("humanapi.readme.io", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/docs"))
        .pipe(replace("subdomain&quot;:&quot;humanapi", "subdomain&quot;:&quot;quantimo"))
        .pipe(replace("dash.readme.io/project/humanapi/v1.0/docs", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/docs"))
        .pipe(replace("dash.readme.io/project/humanapi/v1.1/docs", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/docs"))
        .pipe(replace("hub.humanapi.html", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/docs"))
        .pipe(replace("https://itunes.apple.com/us/app/human-api/id997774112?mt=8", "{{$GLOBALS['HOST_APP_SETTINGS']->additionalSettings->downloadLinks->iosApp}}"))
        .pipe(replace("https://api.humanapi.co/v1/human", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/api/v1/user"))
        .pipe(replace("new-human-api-app-released-on-the-apple-app-store.html", "{{$GLOBALS['HOST_APP_SETTINGS']->additionalSettings->downloadLinks->iosApp}}"))
        .pipe(replace("https://connect.humanapi.co/connect.js", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/api/v1/integration.js"))
        .pipe(replace("https://connect.humanapi.co/blank/hc-close", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/api/v1/window/close"))
        .pipe(replace("https://connect.humanapi.co/blank/hc-finish", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/api/v1/connection/finish"))
        .pipe(replace("humanId", "quantimodoUserId"))
        .pipe(replace("human_id", "quantimodoUserId"))
        .pipe(replace("https://user.humanapi.co/v1/connect/tokens", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/api/v1/connect/tokens"))
        .pipe(replace("human-api-overview", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}-api-overview"))
        .pipe(replace("https://api.humanapi.co/[version]/human", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/api/v1/user"))
        .pipe(replace("enterprise@humanapi.co", "info@quantimo.do"))
        .pipe(replace("HumanConnect", "{{$GLOBALS['HOST_APP_SETTINGS']->appDisplayName}}Integration"))
        .pipe(replace("support@humanapi.co", "info@quantimo.do"))
        .pipe(replace("https://connect.humanapi.co/assets/button/blue.png", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/qm-connect/connect.png"))
        .pipe(replace("connect-health-data", "import-data"))
        .pipe(replace("enterprise:::at:::humanapi.co", "info:::at:::quantimo.do"))
        .pipe(replace("https://connect.humanapi.co/blank", "https://{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do"))
        .pipe(replace("user.humanapi.co/v1/connect/publictokens", "{{$GLOBALS['HOST_APP_SETTINGS']->clientId}}.quantimo.do/v1/connection/publicToken"))
        .pipe(replace("www.humanapi.co", "{{str_replace('https://', '', $GLOBALS['HOST_APP_SETTINGS']->homepageUrl}}"))
        .pipe(replace("connecting their health data", "connecting"))
        .pipe(replace("health data", "data"))
        .pipe(replace("You can use ours if you want!", "Example"))
        .pipe(replace("CLIENT_ID", "{{$clientApp->client_id}}"))
        .pipe(replace("as-is to your server for step 2.", "to your server"))
        .pipe(replace("Pretty neat huh? You should save them with the appropriate", "Save the credentials with the your"))
        .pipe(replace("var options", "{{$GLOBALS['HOST_APP_SETTINGS']->appDisplayName}}Integration.options"))
        .pipe(replace("var options", "{{$GLOBALS['HOST_APP_SETTINGS']->appDisplayName}}Integration.options"))
        .pipe(rename(function (path) {
            //path.dirname += "/ciao";
            path.basename += ".blade";
            path.basename = path.basename.replace(".blade.blade", ".blade");
            path.extname = ".php";
        }))
        .pipe(gulp.dest(destination));
}
function uploadToS3(filePath) {
    if(!process.env.AWS_ACCESS_KEY_ID){
        qmLog.error("Cannot upload to S3. Please set environmental variable AWS_ACCESS_KEY_ID");
        return;
    }
    if(!process.env.AWS_SECRET_ACCESS_KEY){
        qmLog.error("Cannot upload to S3. Please set environmental variable AWS_SECRET_ACCESS_KEY");
        return;
    }
    qmLog.info("Uploading " + filePath);
    var s3 = require('gulp-s3-upload')({accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY});
    return gulp.src([filePath]).pipe(s3({
        Bucket: 'quantimodo',
        ACL: 'public-read',
        keyTransform: function(relative_filename) {
            return s3RelativePath = 'testing/' + relative_filename;
        }
    }, {
        maxRetries: 5,
        logger: console
    }));
}
function cleanFiles(filesArray) {
    qmLog.info("Cleaning " + JSON.stringify(filesArray) + '...');
    return gulp.src(filesArray, {read: false}).pipe(clean());
}
function cleanFolder(folderPath) {
    qmLog.info("Cleaning " + folderPath + " folder...");
    return gulp.src(folderPath + '/*', {read: false}).pipe(clean());
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
    console.log("MAKE SURE TO RUN cd public.built/ionic/Modo && yarn install BEFORE RUNNING THIS TASK!");
    var target = gulp.src(paths.src.path + '/index.html');
    // It's not necessary to read the files (will speed up things), we're only after their paths:
    var injectToInjectJsHtmlTag = gulp.src([
        './public.built/ionic/app-configuration/js/**/*.js',
        //'./public.built/ionic/app-configuration/js/**/*.css',  // TODO: Not sure why this is here?
        './public.built/ionic/app-configuration/lib/md-color-picker/dist/mdColorPicker.min.css',
        './public.built/ionic/app-configuration/lib/md-color-picker/dist/mdColorPicker.min.css',
        './public.built/ionic/app-configuration/lib/tinycolor/dist/tinycolor-min.js', // Must come before mdColorPicker.min.js
        './public.built/ionic/app-configuration/lib/md-color-picker/dist/mdColorPicker.min.js'
        //'./public.built/ionic/Modo/www/lib/ui-iconpicker/**/*.js',
        //'./public.built/ionic/Modo/www/lib/ui-iconpicker/**/*.css'
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
gulp.task('update-hostname-in-supervisor-config', [], function () {
    var outputFolderPath = 'configs/etc/supervisor';
    var pathToFile = outputFolderPath + '/supervisord.conf';
    qmLog.info("Setting __HOST_NAME__ to " + process.env.HOSTNAME + " in " + pathToFile);
    var filesToUpdate = [pathToFile];
    return gulp.src(filesToUpdate, {base: '.'})
        .pipe(replace("__HOST_NAME__", process.env.HOSTNAME))
        .pipe(gulp.dest('./'));
});
gulp.task('watch', function() {
    gulp.watch('./public.built/ionic/app-configuration/**/*', ['copy']);
});
gulp.task('copy', function() {
    if (!fs.existsSync('./public.built/ionic/Modo/www/configuration')){fs.mkdirSync('./public.built/ionic/Modo/www/configuration');}
    gulp.src('./public.built/ionic/app-configuration/**/*')
        .pipe(gulp.dest('./public.built/ionic/Modo/www/configuration'));
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
gulp.task('cleanUnzipFolder', [], function(){
    return gulp.src("sdks-unzipped/*",
        { read: false }).pipe(clean());
});
gulp.task('composerDumpAutoload', function (callback) {
    executeCommand('cd laravel && composer dump-autoload', callback);
});
gulp.task('configureIonicApp', function (callback) {
    executeCommand('cd ' + pathToModo + ' && yarn install', callback);
});
gulp.task('composerInstallSlim', function (callback) {
    executeCommand('cd slim & composer install --ignore-platform-reqs', callback);
});
gulp.task('composerInstallLaravel', function (callback) {
    executeCommand('cd laravel & composer install --ignore-platform-reqs', callback);
});
gulp.task('phpunitLaravel', ['composerInstallLaravel'], function (callback) {
    executeCommand('phpunit --stop-on-error --stop-on-failure --configuration laravel/phpunit.xml', callback);
});
gulp.task('composerUpdate', function (callback) {
    executeCommand('composer update --ignore-platform-reqs', callback);
});
gulp.task('composerUpdateSlim', function (callback) {
    executeCommand('cd slim & composer update --ignore-platform-reqs', callback);
});
gulp.task('composerUpdateLaravel', function (callback) {
    executeCommand('cd laravel & composer update --ignore-platform-reqs', callback);
});
gulp.task('ionicServe', function (callback) {
    executeCommand('cd public.built\\ionic\\Modo & ionic serve', callback);
});
gulp.task('bowerInstall', function (callback) {
    executeCommand('bower install --allow-root', callback);
});
gulp.task('cleanDocsFolder', [], function(){
    return gulp.src("public.built/converted-docs/*",
        { read: false }).pipe(clean());
});
gulp.task('cleanScreenshotsFolder', [], function(){
    return gulp.src(paths.screenshots + "/*",
        { read: false }).pipe(clean());
});
gulp.task('generateDocumentation', ['cleanDocsFolder'], function () {
    //return gulp.src(['www/**/*']).pipe(gulp.dest('build/chrome_extension/www'));
    var source = ['public.built/human-api-docs/http___hub.humanapi.co_docs/hub.humanapi.co/**/*.html'];
    var destination = 'public.built/human-api-docs-converted';
    return replaceWords(source, destination);
});
gulp.task('updateBladeDocs', [], function () {
    //return gulp.src(['www/**/*']).pipe(gulp.dest('build/chrome_extension/www'));
    var source = ['laravel/resources/views/docs/**/*'];
    var destination = 'laravel/resources/views/docs';
    return replaceWords(source, destination);
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
gulp.task('invert-icons', function () {
    var jimp = require('gulp-jimp');
    gulp.src('512/**/*').pipe(jimp({'-white': {invert: true}})).pipe(gulp.dest('./ion-icons-white/'));
});
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};
gulp.task('importTestDatabase', function () {
    var dbUser = "root";
    var dbPassword = "root";
    var testDbName = (process.env.TEST_NAME) ? process.env.TEST_NAME : "quantimodo_test";
    var util = require('util');
    var shell = require('gulp-shell');
    var shellCommand = util.format('mysql -u %s -p%s -e "CREATE DATABASE %s"', dbUser, dbPassword, testDbName);
    gulp.src('').pipe(shell([shellCommand]));
    shellCommand = util.format('mysql -u %s -p%s %s < slim/tests/fixtures/quantimodo.sql', dbUser, dbPassword, testDbName);
    //var shellCommand = util.format('dir');
    gulp.src('').pipe(shell([shellCommand]));
    qmLog.info('\n\x1b[32m%s\x1b[0m', shellCommand + ' succeeded!');
});
gulp.task('updateTestDatabase', function (callback) {
    executeCommand('bash /vagrant/slim/Database/transfer_new_data_from_production_to_development_database.sh', callback);
});
gulp.task('updateAndUploadTestDatabase', function (callback) {
    runSequence(
        'updateTestDatabase',
        'zipTestDatabase',
        'uploadTestDatabaseToS3',
        function (error) {
            if (error) {
                qmLog.error(error.message);
            } else {
                qmLog.info('TEST DB UPLOAD FINISHED SUCCESSFULLY');
            }
            callback(error);
        });
});
gulp.task('uploadTestDatabaseToS3', function () {
    return uploadToS3(pathToZippedTestDatabase);
});
gulp.task('downloadTestDatabase', [], function(){
    qmLog.info("Downloading " + s3UrlToTestDatabase);
    return download(s3UrlToTestDatabase)
        .pipe(gulp.dest(pathToTestFixtures));
});
gulp.task('zipTestDatabase', [], function () {
    var zip = require('gulp-zip');
    return gulp.src([pathToTestDatabase])
        .pipe(zip(zippedTestDbFilename))
        .pipe(gulp.dest(pathToTestFixtures));
});
var dimensions = {
    width: 1024,
    height: 20000
};
function getNightmare() {
    var Nightmare = require('nightmare');
    var nightmare = new Nightmare({
        show: false,
        width: dimensions.width,
        height: dimensions.height
    });
    return nightmare;
}
function getDimensions(url, waitForThisSelector, callback) {
    dimensions = getNightmare()
        .goto(url)
        //.wait(waitForThisSelector)
        .wait(30000)
        .evaluate(function() {
            var body = document.querySelector('body');
            console.log(JSON.stringify(body));
            //callback();
            return {
                height: body.scrollHeight,
                width:body.scrollWidth
            }
        })
        .end()
        .then(function (result) {
            dimensions = result;
            console.log(result);
            takeScreenShot(url, waitForThisSelector, dimensions, callback);
            callback(url, waitForThisSelector);
        })
        .catch(function (error) {
            console.error('Search failed:', error);
        });
}
function takeScreenShot(url, waitForThisSelector, dimensions, callback) {
    console.log("Dimensions " + JSON.stringify(dimensions));
    getNightmare()
    //.viewport(dimensions.width, dimensions.height)
        .goto(url)
        //.type('#search_form_input_homepage', 'github nightmare')
        //.click('#search_button_homepage')
        .viewport(dimensions.width, dimensions.height)
        .wait(waitForThisSelector)
        .screenshot(paths.screenshots + '/study.png')
        .pdf(paths.screenshots + '/study.pdf')
        .html(paths.screenshots + '/study.html')
        .end()
        .then(function (result) {
            console.log(result);
            callback();
        })
        .catch(function (error) {
            console.error('Search failed:', error);
            callback();
        });
}
var screenShotUrl = paths.studyBaseUrl + 'causeVariableName=Sleep%20Duration&effectVariableName=Overall%20Mood&hideMenu=true';
gulp.task('takeScreenShot', ['cleanScreenshotsFolder'], function (callback) {
    qmLog.info("Taking screen shot of " + screenShotUrl);
    return takeScreenShot(screenShotUrl, '#studyCharts > div:nth-child(1) > h2', dimensions, callback);
});
gulp.task('getDimensions', [], function (callback) {
    qmLog.info("Getting dimensions of " + screenShotUrl);
    return getDimensions(screenShotUrl, '#studyCharts > div:nth-child(1) > h2', callback);
});
gulp.task('inlineCss', function() {
    var inlineCss = require('gulp-inline-css');
    return gulp.src(paths.screenshots + '/*.html')
        .pipe(inlineCss())
        .pipe(gulp.dest(paths.screenshots + '/inline-css/'));
});
function writeToFile(filePath, stringContents) {
    filePath = './' + filePath;
    qmLog.info("Writing to " + filePath);
    if(typeof stringContents !== "string"){stringContents = prettyJSONStringify(stringContents);}
    return fs.writeFileSync(filePath, stringContents);
}
function exportHighchart(filePath, chartOptions) {
    var exporter = require('highcharts-export-server');
    //Export settings
    var exportSettings = {
        outfile: filePath + '.svg',
        type: 'svg',
        options: chartOptions
    };
    //Set up a pool of PhantomJS workers
    exporter.initPool();
    //Perform an export
    /*
        Export settings corresponds to the available CLI arguments described
        above.
    */
    exporter.export(exportSettings, function (err, res) {
        if(err){
            qmLog.error(err);
            return;
        }
        //qmLog.info("output: " + prettyJSONStringify(res));
        if(res.data){
            writeToFile(filePath + '.svg', res.data);
        }
        //The export result is now in res.
        //If the output is not PDF or SVG, it will be base64 encoded (res.data).
        //If the output is a PDF or SVG, it will contain a filename (res.filename).
        //Kill the pool when we're done with it, and exit the application
        exporter.killPool();
        process.exit(1);
    });
}
gulp.task('exportHighchart', function() {
});
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
gulp.task('get-study', [], function (callback) {
    var apiInstance = new Quantimodo.AnalyticsApi();
    function qmApiResponseCallback(error, data, response) {
        for (var i = 0; i < data.highcharts.length; i++) {
            exportHighchart(data.causeVariable.id + "_" + data.effectVariable.id + "_" + data.highcharts[i].chartId, data.highcharts[i].highchartConfig);
        }
        callback();
    }
    apiInstance.getStudy({causeVariableName: "Sleep Duration", effectVariableName: "Overall Mood"}, qmApiResponseCallback);
});
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
    var destination = 'public.built/ionic/Modo/build/quantimodo-chrome-extension/js';
    destination = paths.src.path + '/js';
    return copyFiles('custom-lib/**/*', destination);
});
gulp.task('laradock-copy', [], function () {
    gulp.src('configs/etc/nginx/ionic.location.'+qm.getReleaseStage()+'.nginx.conf')
        .pipe(rename('ionic.location.nginx.conf'))
        .pipe(gulp.dest('laradock/nginx'));
    return copyFiles('configs/laradock/**/*', 'laradock');
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
    getCommitMessage(callback){
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
gulp.task('travis-build-trigger', [], function (callback) {
    git.clone('https://'+qmGit.accessToken+'@github.com/mikepsinn/docker-analytics-tests', function (err) {
        if (err) {qmLog.info(err);}
        git.pull(function (err) {
            if (err) {qmLog.info(err);}
            git.stash(function (err) {
                if (err) {qmLog.info(err);}
                git.add(function (err) {
                    if (err) {qmLog.info(err);}
                });
            });
        });
        callback();
    });
});
var release = require('gulp-github-release');
gulp.task('release-jenkins-backup', function(){
    gulp.src('./jenkins-backup.zip')
        .pipe(release({
            token: process.env.GITHUB_ACCESS_TOKEN,                     // or you can set an env var called GITHUB_TOKEN instead
            owner: 'mikepsinn',                    // if missing, it will be extracted from manifest (the repository.url field)
            repo: 'jenkins-backup',            // if missing, it will be extracted from manifest (the repository.url field)
            tag: 'v'+apiVersionNumber,                      // if missing, the version will be extracted from manifest and prepended by a 'v'
            name: 'publish-release v'+apiVersionNumber,     // if missing, it will be the same as the tag
            notes: 'very good!',                // if missing it will be left undefined
            draft: false,                       // if missing it's false
            prerelease: false,                  // if missing it's false
            manifest: require('./package.json') // package.json from which default values will be extracted if they're missing
        }));
});
var connectorHelper = {
    getConnectorId: function(connectorName){
        var map = {mint: 80};
        return map[connectorName];
    },
    getCredentials: function (connection, callback) {
        var db = qmDB.mysql.production;
        // db().select('user_id', 'connector_id', 'attr_key', db().raw("AES_DECRYPT(attr_value, 'AhfwDFPQfaZPQr00sFhfw3FrTw30EakM6zpF16d3') as credentialValue"))
        //     .from('credentials').where({connector_id: connection.connector_id, user_id: connection.user_id}).timeout(10000)
        //     db().raw("select user_id, connector_id, attr_key, AES_DECRYPT(attr_value, 'AhfwDFPQfaZPQr00sFhfw3FrTw30EakM6zpF16d3') as credentialValue from credentials "+
        //         " where user_id="+connection.user_id+" and connector_id="+connection.connector_id)
        db().raw("select `attr_key` as `attrKey`, attr_value as attrValue, ``.`created_at` as `createdAt`, ``.`updated_at` as `updatedAt` from `credentials` where `user_id` = 230 and `connector_id` = 80")
            .then(function (credentialsArray) {
                credentialsArray = credentialsArray[0];
                function convertCryptKey(strKey) {
                    var newKey = new Buffer([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
                    var bufStrKey = new Buffer(strKey);
                    for (var i = 0; i < bufStrKey.length; i++) {
                        newKey[i % 16] ^= bufStrKey[i];
                    }
                    return newKey;
                }
                function decrypt(cyphertext) {
                    var crypto = require("crypto");
                    // although this function could run on the client - you should not store 'My very secret key' on the client, nor pass it
                    // via API call. You should decrypt on the server.
                    var dc = crypto.createDecipheriv('aes-128-ecb', convertCryptKey('AhfwDFPQfaZPQr00sFhfw3FrTw30EakM6zpF16d3'), '');
                    var decrypted = dc.update(cyphertext, 'hex', 'utf8') + dc.final('utf8');
                    return decrypted;
                }
                var credentialsObject = {};
                for (var i = 0; i < credentialsArray.length; i++) {
                    var defaultClientElement = credentialsArray[i];
                    credentialsObject[defaultClientElement.attrKey] = decrypt(defaultClientElement.attrValue);
                }
                callback(credentialsObject);
            });
    },
    updateWaitingConnections: function (connectorName, callback){
        var connectorId = connectorHelper.getConnectorId(connectorName);
        qmLog.info("envs", process.env);
        var itemsProcessed = 0;
        qmDB.mysql.production().select().from('connections').where({connector_id: connectorId}).timeout(10000).then(function (connections) {
            console.log(connections);
            for (var i = 0; i < connections.length; i++) {
                var connection = connections[i];
                connectorHelper.getCredentials(connection, function (credentialsObject) {
                    itemsProcessed++;
                    if(itemsProcessed === connections.length) {
                        connectorHelper.updateConnector[connectorName](credentialsObject, connection, callback);
                    } else {
                        connectorHelper.updateConnector[connectorName](credentialsObject, connection);
                    }
                });
            }
        });
    },
    updateConnector: {
        mint: function (credentials, connection, callback){
            qmLog.info("Getting credentials from mint...");
            require('pepper-mint')(credentials.username, credentials.password, credentials.ius_session || null, credentials.thx_guid || null)
                .then(function(mint) {
                    qmLog.info("Got credentials from mint!");
                    credentials.ius_session = mint.sessionCookies.ius_session;
                    credentials.thx_guid = mint.sessionCookies.thx_guid;
                    writeToFile('/tmp/credentials_connector_'+credentials.connector_id+'_user_'+credentials.user_id+".json", credentials);
                    var startDate = new Date();
                    startDate.setMonth(startDate.getMonth() - 3);
                    if(connection.last_successful_updated_at){startDate = new Date(connection.last_successful_updated_at)}
                    qmLog.info("Importing transactions from mint...");
                    mint.getTransactions({startDate: startDate, endDate: new Date()}).then(function(transactions){
                        qmLog.info("Got " + transactions.length + " transactions from mint!");
                        var dataFilePath = './tmp/data_mint_user_id_'+connection.user_id+".json";
                        var dataFile = {
                            spreadsheetData: transactions,
                            credentials: credentials,
                            userId: connection.user_id,
                            connectorId: connection.user_id
                        };
                        qmDB.mongo.collections.connectorData().insert(dataFile, function (err, result) {
                            if(err){qmLog.error(err)}
                            qmLog.info("Inserted "+transactions.length+" transactions");
                            if(callback){callback(result);}
                        })
                        //writeToFile(dataFilePath, dataFile);
                        //executeCommand("export TASK_NAME=ImportMeasurementSpreadsheets && export DATA_FILE_PATH=" + dataFilePath +" && bash ./slim/Tasks/phpunit/run_task.sh");
                    });
                });
        }
    }
};
gulp.task('update-mint-connections', function(callback) {
    connectorHelper.updateWaitingConnections("mint", callback);
});
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
gulp.task('sync-public-built-to-www', [], function () {
    var dirSync = require('gulp-directory-sync');
    return gulp.src( '' )
        .pipe(dirSync( 'public.built', 'www', { printSummary: true, ignore: function( dir, file ) {
            // *.idea,*,*.,/,*.,/,,/,/,/,/,/,/,/,/,/
            var directoriesToExclude = [
                '.git',
                'build',
                'codegen',
                'node_modules',
                'phantomjs',
                'platforms',
                'plugins',
                'sdk-repos',
                'sdks-unzipped',
                'sdks-zipped',
                'wp',
                'xhgui',
            ];
            var extensionsToExclude = [
                'env',
                'git',
                'map',
                'php',
                'popup-combined'
            ];

            return file === '.svn';
        }}))
        .on('error', gutil.log);
});