var unzip = require('unzip');
var fs = require('fs');
var http = require('http');
var https = require('https');
var exec = require('child_process').exec;
/*https://www.curseforge.com/wow/addons/elvui_addonskins/download/2530751
 https://media.forgecdn.net/files/2530/751/AddOnSkins-3.72.zip
 
 https://media.forgecdn.net/files/2530/751/elvui_addonskins-3.72.zip*/
/*
 * 下载文件
 * stepCallback(当前进度,当前下载MB,总文件大小MB)
 * callback(下载文件路径)
 * */
var downloadList = {};
var downloadTimeout = {};

function $download(fileName, urlarg, stepCallback, callback, oName, urlIndex, timeoutreload) {
    var url = "";
    if(typeof urlarg === "string")
        url = urlarg;
    else if(urlarg instanceof Array && urlIndex && urlarg[urlIndex])
        url = urlarg[urlIndex];
    else if(urlarg instanceof Array && urlIndex === undefined)
        url = urlarg[0];
    else
        return callback({ok: false, data: "无法找到该插件"});
    console.log(oName);
    if(downloadList[fileName] && !oName) {
        $abortDownload(fileName);
    }
    var h = /^https:\/\//.test(url) ? https :
        /^http:\/\//.test(url) ? http : null;
    var request = h.get(url, function(response) {
        if(timeout) clearTimeout(timeout);
        if(!downloadList[fileName]) {
            request.abort();
            callback({ok: false, data: "取消下载"});
            return;
        }
        console.log("$download ", response.statusCode, fileName);
        if(response.statusCode === 307 || response.statusCode === 302) {
            if(!downloadList[fileName]) callback({ok: false, data: "取消下载"});
            stepCallback(0, 0, 0, response.headers.location);
            $download(fileName, response.headers.location, stepCallback, callback, oName || fileName);
            return;
        }
        if(response.statusCode === 404) {
            if(!downloadList[fileName]) callback({ok: false, data: "取消下载"});
            stepCallback(2, 2, 2);
            $download(fileName, urlarg, stepCallback, callback, oName || fileName, urlIndex === undefined ? 1 : ++urlIndex);
            return;
        }
        stepCallback(1, 1, 1);
        response.setEncoding("binary");
        var len = parseInt(response.headers['content-length'], 10);
        var body = '';
        var cur = 0;
        var total = len / 1048576; //1048576 - bytes in  1Megabyte
        response.on("data", function(chunk) {
            body += chunk;
            cur += chunk.length;
            if(stepCallback) stepCallback((100.0 * cur / len).toFixed(2), (cur / 1048576).toFixed(2), total.toFixed(2));
        });
        response.on("end", function(e) {
            if(timeout) clearTimeout(timeout);
            if(response.aborted) {
                callback({ok: false, data: "取消下载"});
                return;
            }
            var filePath = `./temp/${fileName}`;
            fs.writeFile(filePath, body, 'binary', function(err) {
                if(err) {
                    callback({ok: false, data: err});
                }
                callback({ok: true, filePath: filePath});
            });
        });
        request.on("error", function(e) {
            callback({ok: false, data: e});
        });
    });
    downloadList[oName || fileName] = request;
    var timeout = setTimeout(() => {
        request.abort();
        if(!downloadList[oName || fileName]) return;
        var ri = timeoutreload === undefined ? 0 : ++timeoutreload;
        if(ri > 5) return callback({ok: false, data: "请求超时"});
        stepCallback(0, 0, 0, "请求超时重试中");
        console.log("$download timeout");
        $download(fileName, urlarg, stepCallback, callback, oName, urlIndex, ri);
    }, 5000);
    downloadTimeout[oName || fileName] = timeout;
};

function $abortDownload(fileName) {
    console.log("$abortDownload ", fileName);
    downloadList[fileName].abort();
    if(downloadTimeout[fileName])
        clearTimeout(downloadTimeout[fileName]);
    delete downloadTimeout[fileName];
    delete downloadList[fileName];
}

function $unzip(fileName, outpath, callback) {
    var tocList = {};
    fs.createReadStream(`./temp/${fileName}`)
      .pipe(unzip.Parse())
      .on('entry', function(entry) {
          var fileName = entry.path;
          var type = entry.type; // 'Directory' or 'File'
          var size = entry.size;
          if(/.*?\.toc$/.test(fileName)) {
              var pathlist = fileName.split("/");
              if(pathlist.length === 2)
                  this[pathlist[0]] = pathlist[1];
          }
          entry.autodrain();
      }.bind(tocList))
      .on('close', function() {
          fs.createReadStream(`./temp/${this.fileName}`)
            .pipe(unzip.Extract({path: outpath}))
            .on('error', () => {
                callback(false);
            })
            .on('close', (e) => {
                var toclist = {};
                for (var i in this.tocList) {
                    toclist[i] = tocToJson(fs.readFileSync(`${this.outpath}/${i}/${i}.toc`).toString());
                }
                if(Object.keys(toclist).length === 1)
                    return callback(true, Object.keys(toclist)[0], this.fileName, Object.values(toclist)[0]);
                for (var k in toclist) {
                    if(checkRule(k, toclist[k])) {
                        return callback(true, k, this.fileName, toclist[k]);
                    }
                }
                callback(true);
            });
      }.bind({outpath: outpath, fileName: fileName, tocList: tocList}));
}

/*遍历插件目录 返回对象
 * {
 *   {
 *       name
 *       toc
 *   }
 * }
 * */
function $getAddons(path, callback) {
    $Dependencies = {};
    if(fs.existsSync(path)) {
        fs.readdir(path, function(err, menu) {
            if(!menu)
                return;
            var list = {}, num = 0, arr = [];
            
            function loadToc(i, callback) {
                if(!menu[i]) return callback();
                readToc(path, menu[i], (toc) => {
                    if(!toc) return loadToc(++i, callback);
                    let ele = menu[i];
                    list[ele] = toc;
                    if($version[ele]) list[ele].Version = $version[ele];
                    else if(list[ele].Version && /^v/i.test(list[ele].Version))
                        list[ele].Version = $version[ele] || list[ele].Version.substr(1);
                    list[ele].name = ele;
                    list[ele].localName = ele;
                    if(checkRule(ele, list[ele], list)) {
                        arr.push(list[ele]);
                    }
                    loadToc(++i, callback);
                });
            };
            loadToc(0, function() {
                callback(
                    {
                        map: list,
                        data: arr
                    }
                );
            });
        });
    } else {
        var wow = path.split(vue.addonsPath)[0];
        var wowExe = wow + "\\Wow.exe";
        var interfacePath = wow + "\\interface";
        if(fs.existsSync(wowExe)) {
            if(!fs.existsSync(interfacePath))
                fs.mkdirSync(interfacePath, 0755);
            fs.mkdirSync(path, 0755);
            callback({
                map: {},
                data: []
            });
        } else {
            alert("选择的目录可能不是WOW所在目录,请重新选择");
        }
    }
}

function readToc(path, ele, callback) {
    fs.stat(path + "/" + ele, function(err, info) {
        if(info.isDirectory()) {
            var tocPath = `${path}/${ele}/${ele}.toc`;
            if(fs.existsSync(tocPath)) {
                fs.readFile(tocPath, (err, data) => {
                    if(err) {
                        callback(null);
                    } else {
                        callback(tocToJson(data));
                    }
                });
            } else {
                callback(null);
            }
        } else {
            callback(null);
        }
    });
}

var $Dependencies = {};
var RequiredDeps = {};

function checkRule(name, data, list) {
    if($mapping[name]) data.name = $mapping[name];
    if($filter[name] === true) data.isFilter = true;
    for (var regex in $rule) {
        if(eval(regex).test(name)) {
            if($rule[regex].reserved === name) {
                data.name = $rule[regex].name;
                return true;
            }
            else {
                return false;
            }
        }
    }
    if(data['RequiredDeps']) {
        data['RequiredDeps'] = data['RequiredDeps'].split(",");
        data['RequiredDeps'].forEach(
            (d) => {
                RequiredDeps[name] = d;
            }
        );
    }
    if(data['Dependencies']) {
        data['Dependencies'] = data['Dependencies'].split(",");
        data['Dependencies'].forEach(
            (d) => {
                $Dependencies[name] = d;
            }
        );
        //return false;
    } //过滤存在依赖的插件
    return true;
}

function tocToJson(toc) {
    var json = {};
    try {
        toc.toString().split("\n").forEach((item) => {
            item = item.match(/^##\s+(.*?):\s+(.*?)\s*$/);
            if(item && item.length === 3)
                json[item[1]] = item[2];
        });
    } catch(e) {
    }
    return json;
}

function $setConfig(str, callback) {
    fs.writeFile("config.json", typeof str === "object" ? JSON.stringify(str) : str, function(err) {
        if(err) {
            callback(false);
        }
        if(callback) callback(true);
    });
}

function $getConfig() {
    if(!fs.existsSync("config.json")) return null;
    try {
        return JSON.parse(fs.readFileSync("config.json"));
    } catch(e) {
        return null;
    }
}

function $search(search, callback) {
    console.log("$search", `https://www.curseforge.com/wow/addons/search?search=${search}`);
    return $get(
        `https://www.curseforge.com/wow/addons/search?search=${encodeURIComponent(search)}`,
        callback,
        () => {callback(null);}
    );
}

function $get(url, callback, ercallback) {
    try {
        var h = /^https:\/\//.test(url) ? https :
            /^http:\/\//.test(url) ? http : null;
        if(!h) return console.log("请求地址错误");
        //get 请求外网
        return h.get(url, function(req) {
            let html = '';
            req.on('data', function(data) {
                html += data;
            });
            req.on('end', function(e) {
                if(req.aborted) {
                    console.log("aborted ", url);
                    callback(null, req);
                    return;
                }
                callback(html, req);
            });
            req.on('error', function(e) {
                if(ercallback) ercallback(null);
            });
        });
    } catch(e) {
        console.log(e);
    }
}

function $openDir(path) {
    path = path.replace(/\//g, "\\");
    exec(`explorer.exe /select,"${path}"`);
}

function $deleteFile(path) {
    console.log("del ", path);
    var files = [];
    if(fs.existsSync(path)) {
        files = fs.readdirSync(path);
        files.forEach(function(file, index) {
            var curPath = path + "\\" + file;
            if(fs.statSync(curPath).isDirectory()) { // recurse
                $deleteFile(curPath);
            } else { // delete file
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

/*其他源插件*/

//获取elvui/tukuib
function $Tukui(callback) {
    return checkTukui(callback, 'tukui');
}

function $Elvui(callback) {
    return checkTukui(callback, 'elvui');
}

function checkTukui(callback, type) {
    var host = "https://www.tukui.org";
    return $get(
        `${host}/welcome.php`,
        (body) => {
            if(type === 'elvui') {
                var elvui = body.match(/\/downloads\/elvui-(.*?)\.zip/);
                if(elvui)
                    callback(
                        {
                            version: elvui[1],
                            download: host + elvui[0]
                        }
                    );
                else
                    callback(null);
            }
            if(type === 'tukui') {
                var tukui = body.match(/\/downloads\/tukui-(.*?)\.zip/);
                if(tukui)
                    callback(
                        {
                            version: tukui[1],
                            download: host + tukui[0]
                        }
                    );
                else
                    callback(null);
            }
        },
        () => {
        }
    );
}

//集合石
function $MeetingStone(callback) {
    return $get(
        `http://w.163.com/special/wowsocial/`,
        (body) => {
            var match = body.match(/http:\/\/blz\.gdl\.netease\.com\/MeetingStone-(.*?)\.zip/);
            if(match)
                callback(
                    {
                        version: match[1],
                        download: match[0]
                    }
                );
            else
                callback(null);
        },
        () => {
        }
    );
}