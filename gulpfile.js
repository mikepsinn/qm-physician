var clean = require('./src/ionic/node_modules/gulp-rimraf');
var fs = require('fs');
var pathToModo = './src/ionic';
var bugsnag = require("./src/ionic/node_modules/bugsnag");
var gulp = require('gulp');
var runSequence = require('./src/ionic/node_modules/run-sequence').use(gulp);
var qm = require('./src/ionic/src/js/qmHelpers');
qm.clean = clean;
qm.gulp = gulp;
qm.appMode.mode = 'testing';
var qmLog = require('./src/ionic/src/js/qmLogger');
qmLog.qm = qm;
qmLog.color = require('./src/ionic/node_modules/ansi-colors');
qm.Quantimodo = require('./src/ionic/node_modules/quantimodo');
qm.staticData = false;
qm.qmLog = qmLog;
qm.qmLog.setLogLevelName(process.env.LOG_LEVEL || 'info');
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
qm.gitHelper.outputCommitMessageAndBranch();
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
    qm.fileHelper.writeToFile('log/lastCommitBuilt', qm.gitHelper.getCurrentGitCommitSha());
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
        .pipe(replace('href="img', 'href="ionic/src/img'))
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
    qm.nodeHelper.execute('cd ' + pathToModo + ' && yarn install', function(){
        qm.nodeHelper.execute('cd ' + pathToModo + ' && bower install', function(){
            qm.nodeHelper.execute('cd ' + pathToModo + ' && gulp', function(){
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
        '!src/ionic/www/**',
        '!src/ionic/node_modules/**',
        'src/**/*'
    ]).pipe(gulp.dest('www'));
});
gulp.task('clean-es5-ext', [], function () {
    qmLog.info("Dealing with Invalid filename ionic/node_modules/es5-ext/test/string/#/plain-replace.js...");
    //return gulp.src('./**/*.js', { read: false }).pipe(rimraf());
    return qm.fileHelper.cleanFiles(['./src/ionic/node_modules/es5-ext/test/**/*'])
});
