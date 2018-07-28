/*
 * 匹配规则
 * 多个依赖的插件无法区分插件的主从关系与真实名称,可以设置以下规则列表进行过滤
 * 名称匹配正则 : {
 *   name : 重定义保留的插件名称
 *   reserved : 所要保留的插件名称
 * }
 * */
var $rule = {
    "/^DBM-(WorldEvents|Uldir|TrialofValor|TombofSargeras|StatusBarTimers|Party-Legion|Party-BfA|Nighthold|GUI|EmeraldNightmare|DMF|DefaultSkin|Core|BrokenIsles|Brawlers|Azeroth-BfA|Argus|AntorusBurningThrone)$/": {
        name: "deadly-boss-mods",
        reserved: "DBM-Core"
    },
    "/^ElvUI_Config$/": {
        name: "ElvUI",
        reserved: "ElvUI"
    },
    "/^Tukui_Config$/": {
        name: "Tukui",
        reserved: "Tukui"
    }
};
/*插件实际名称与线上名称映射关系表*/
var $mapping = {
    "ElkBuffBars": "Elkano's BuffBars"
};
/*更新或工具内添加的插件在此记录更新版本号*/
var $version = {};
/*过滤插件显示为忽略*/
var $filter = {};
/*
 * 特殊处理非curseforge源插件
 * "插件名称":{
 *   check: 特殊处理全局方法 function(callback({version,download})) 方法返回一个对象包含版本号与下载地址
 * }
 * */
var $otherAddons = {
    "ElvUI": {
        check: $Elvui
    },
    "Tukui": {
        check: $Tukui
    },
    "MeetingStone": {
        check: $MeetingStone,
        displayName: "集合石"
    }
};
var vue = new Vue(
    {
        el: "#app",
        data: {
            wowPath: "",
            addonsPath: "\\interface\\addons",
            interface: null,
            tableData: [],
            tableList: [],
            config: $getConfig() || {},
            loading: [],
            downloadType: [],
            size: 20,
            page: 1,
            tableH: 300,
            checklist: [],
            release: null,//是否只检查release版本
            //搜索
            searchH: 500,
            searchText: "",
            searchList: [],
            searchLoading: false,
            searchShow: false,
            searchTabs: 1,
            searchDownloadType: [],
            //下载列表
            downloadShow: false,
            downloadDownloadType: [],
            downloadList: [],
            //常用插件
            otherAddons: [],
            otherDownloadType: []
        },
        mounted() {
            for (var k in $otherAddons) {
                $otherAddons[k].isOtherAddons = true;
                $otherAddons[k].name = k;
                $otherAddons[k].index = this.otherAddons.length;
                this.otherAddons.push($otherAddons[k]);
            }
            if(typeof this.config.release === "boolean")
                this.release = this.config.release;
            else
                this.release = true;
            if(this.config.wowPath)
                this.wowPath = this.config.wowPath;
            if(this.config.rule)
                $rule = this.config.rule || {};
            if(this.config.mapping)
                $mapping = this.config.mapping || {};
            if(this.config.filter)
                $filter = this.config.filter || {};
            if(this.config.version)
                $version = this.config.version || {};
            $(window).resize(this.resize);
            this.resize();
            $(window).click(this.windowClick);
        },
        methods: {
            windowClick(e) {
                if(
                    $(e.target).closest("#download-list").length > 0 ||
                    $(e.target).closest("#search-list").length > 0
                )
                    return;
                this.searchShow = false;
                this.downloadShow = false;
                return;
            },
            openDir(path) {
                $openDir(path);
            },
            //页面刷新
            refreshAll() {
                location.reload();
            },
            resize() {
                this.tableH = $(window).height() - $("#top-bar").height() - 70;
                this.searchH = $(window).height() - 90;
            },
            refresh() {
                this.tableList = $clone(this.tableList);
            },
            wowPathChange(file) {
                this.wowPath = file.currentTarget.value + this.addonsPath;
                this.config.wowPath = this.wowPath;
                $setConfig(this.config);
            },
            //更新本地插件列表
            updateList() {
                console.log(`更新插件列表`, this.wowPath);
                /*
                 * toc 参数
                 * Interface 对应游戏版本
                 * RequiredDeps 依赖插件
                 */
                //https://wow.curseforge.com/projects/deadly-boss-mods/files/latest
                $getAddons(
                    this.wowPath,
                    (list) => {
                        this.interface = list.map;
                        this.tableData = list.data;
                        this.tableList = this.getTable();
                        //建立依赖关系对象
                        this.dependenciesMap = {};
                        for (var k in list.map) {
                            if(list.map[k].Dependencies instanceof Array) {
                                list.map[k].Dependencies.forEach(
                                    (name) => {
                                        name = $.trim(name);
                                        if(!this.dependenciesMap[name])
                                            this.dependenciesMap[name] = [];
                                        this.dependenciesMap[name].push(k);
                                    }
                                );
                            } else {
                                for (var regex in $rule) {
                                    if(eval(regex).test(k)) {
                                        var name = $rule[regex].reserved;
                                        if(!this.dependenciesMap[name])
                                            this.dependenciesMap[name] = [];
                                        this.dependenciesMap[name].push(k);
                                    }
                                }
                            }
                        }
                        this.refresh();
                        console.log(this.interface);
                    }
                );
            },
            //更新本地插件数据
            updateLocal() {
                if(this.updateLocalTimeout)
                    clearTimeout(this.updateLocalTimeout);
                this.updateLocalTimeout = setTimeout(
                    () => {
                        $getAddons(
                            this.wowPath,
                            (list) => {
                                for (var i in this.tableList) {
                                    try {
                                        this.tableList[i].Version = list.map[this.tableList[i].localName].Version;
                                    } catch(e) {
                                    }
                                }
                                this.refresh();
                            }
                        );
                    }, 200
                );
            },
            //检查更新
            clearCheckGet(name) {
                if(this.checklist[name]) {
                    this.checklist[name].abort();
                    delete this.checklist[name];
                }
            },
            getOnlineData(row) {
                if(row.isFilter) return;
                let index = row.index;
                this.setLoading(index, true);
                this.clearCheckGet(row.name);
                this.checklist[row.name] = this.setSearch(
                    row.searchName || row.name,
                    (list) => {
                        console.log(row.name, index, row.index);
                        this.tableList[index].onlineData = list;
                        var checked = list[0];
                        if(list.length > 0) {
                            if(checked.other) {
                                this.tableList[index].isOtherAddons = true;
                                this.setOnlineVersion(
                                    row,
                                    [{
                                        download: checked.href,
                                        version: checked.version,
                                        other: true,
                                        release: true
                                    }]);
                            } else {
                                list.forEach(
                                    (e) => {
                                        if(e.searchName === row.searchName || e.searchName === row.name) {
                                            checked = e;
                                            return false;
                                        }
                                    }
                                );
                                this.onlineNameChange(row, checked.name);
                            }
                            this.tableList[index].onlineName = checked.name;
                        }
                        else this.setLoading(index, false);
                        this.refresh();
                    }
                );
                return "";
            },
            //获取插件信息
            setSearch(name, callback) {
                if($otherAddons[name] && $otherAddons[name].check) {
                    return $otherAddons[name].check(
                        (e) => {
                            callback(
                                !e ? [] :
                                    [
                                        {
                                            name: name,
                                            version: e.version,
                                            href: e.download,
                                            other: true
                                        }
                                    ]
                            );
                        }
                    );
                }
                return $search(name, (html) => {
                    if(!html) return this.setLoading(index, false);
                    var temp = $(`<div></div>`);
                    temp.append(html);
                    var table = temp.find(".listing-project li");
                    var list = [];
                    if(table.length === 0) {
                        /*list.push(
                         {
                         img: "",
                         name: "暂无",
                         href: ""
                         }
                         );*/
                    } else {
                        table.each(
                            function() {
                                var href = $(this).find(".button--download").attr("href");
                                var name = "";
                                try {
                                    name = href.split("/");
                                    name = name[name.length - 2];
                                } catch(e) {
                                    console.log("插件名称匹配出错", href);
                                }
                                list.push(
                                    {
                                        searchName: $.trim($(this).find(".list-item__title").html()),
                                        updateTime: $(this).find(".standard-datetime").html(),
                                        downloadCount: $(this).find(".count--download").html(),
                                        name: name,
                                        href: href,
                                        description: $(this).find(".list-item__description").html()
                                    }
                                );
                            }
                        );
                    }
                    temp.html("");
                    temp = null;
                    callback(list);
                });
            },
            //远程插件菜单选择
            onlineNameChange(row, onlineName) {
                var index = row.index;
                this.setLoading(index, true);
                delete this.tableList[index].onlineVersionList;
                this.clearCheckGet(row.name);
                this.checklist[row.name] = this.getVersionList(
                    onlineName,
                    (list) => {
                        this.setOnlineVersion(row, list);
                    }
                );
            },
            //选择远程插件版本
            setOnlineVersion(row, list) {
                var index = row.index;
                this.tableList[index].onlineVersionList = list;
                this.tableList[index].onlineVersion = list[0].download;
                this.refresh();
                this.setLoading(index, false);
            },
            //获取远程插件版本列表
            getVersionList(name, callback, otherData) {
                if(otherData) {
                    return $otherAddons[otherData.name].check(
                        (data) => {
                            for (var k in otherData) {
                                if(k === "check") continue;
                                data[k] = otherData[k];
                            }
                            data.release = true;
                            data.onlineVersion = data.download;
                            callback([data]);
                        }
                    );
                }
                return $get(
                    `https://www.curseforge.com/wow/addons/${name}/files?page=1`,
                    (html) => {
                        var temp = $(`<div></div>`);
                        temp.append(html);//project-file-name
                        var table = temp.find(".project-file-listing");
                        var tr = table.find("tr");
                        var list = [];
                        if(tr.length > 0) {
                            tr.each(
                                function(i) {
                                    if(i === 0) return true;
                                    var version = $(this).find(".file__name").html();
                                    if(/^v/i.test(version)) version = version.substr(1);
                                    var data = {
                                        download: $(this).find("a.button--download").attr("href"),
                                        gameVersion: $(this).find(".version__label").html(),
                                        version: version
                                    };
                                    if(/release/i.test($(this).find(".file-phase--release").attr("title"))) {
                                        data.release = true;
                                        list.push(data);
                                    } else {
                                        data.release = false;
                                        if(!vue.release) list.push(data);
                                    }
                                }
                            );
                        }
                        temp.html("");
                        temp = null;
                        if(callback) callback(list);
                    },
                    () => {
                        this.setLoading(index, false);
                        callback([]);
                    }
                );
            },
            setLoading(i, b) {
                Vue.set(this.loading, i, b);
            },
            setDownloadType(i, b, type) {
                if(type) Vue.set(this[`${type}DownloadType`], i, b);
                else Vue.set(this.downloadType, i, b);
            },
            //是否需要更新
            checkIsUpdate(row) {
                if(!row.onlineVersionList) return null;
                var b = true;
                row.onlineVersionList.forEach(
                    (v) => {
                        if(row.onlineVersion === v.download) {
                            if($.trim(String(v.version)) === $.trim(String(row.Version)))
                                b = false;
                            return false;
                        }
                    }
                );
                return b;
            },
            //下载文件
            upDateFiles(row, callback, type) {
                if(!row.onlineVersion) return null;
                var download;
                var index = row.index;
                if(row.isOtherAddons) {
                    download = row.onlineVersion || row.download;
                } else {
                    this.setDownloadType(index, "准备开始下载", type);
                    var arg = row.onlineVersion.split("/");
                    download = [/*https://www.curseforge.com/wow/addons/weakauras-2/download/2572742/file*/
                        `https://www.curseforge.com${row.onlineVersion}/file`,
                        `https://wow.curseforge.com/projects/${arg[3]}/files/${arg[5]}/download`
                    ];
                }
                $download(row.name, download,
                    (p, s, t, msg) => {
                        if(p === 0 && s === 0 && t === 0) {
                            this.setDownloadType(index, "解析下载地址^^^" + msg, type);
                            return;
                        }
                        if(p === 1 && s === 1 && t === 1) {
                            this.setDownloadType(index, "开始下载", type);
                            return;
                        }
                        if(p === 2 && s === 2 && t === 2) {
                            this.setDownloadType(index, "切换下载节点", type);
                            return;
                        }
                        this.setDownloadType(index, `${p}%  ${s}/${t}mb`, type);
                        console.log("正在下载", p, s, t);
                    },
                    (e) => {
                        if(e.ok) {
                            console.log("解压中");
                            this.setDownloadType(index, `解压中`, type);
                            $unzip(row.name, this.wowPath, function(e, fileName, name, data) {
                                if(e) {
                                    var row = this;
                                    vue.setNameMapping(fileName, row.searchName);
                                    vue.updateLocal();
                                    console.log("解压完成");
                                    //由于插件内部版本号不规范,更新后的插件无法校验是否最新,在此记录新更新的版本号
                                    row.onlineVersionList.forEach(
                                        (a) => {
                                            if(row.onlineVersion === a.download) {
                                                $version[fileName] = a.version;
                                                vue.saveVersion();
                                                return false;
                                            }
                                        }
                                    );
                                    vue.setDownloadType(index, false, type);
                                } else {
                                    console.log("错误的压缩包");
                                    vue.setDownloadType(index, false, type);
                                }
                                if(callback) callback(e, fileName);
                            }.bind(row));
                        } else {
                            this.setDownloadType(index, false, type);
                            $msg(`${row.name} : ${e.data}`);
                            if(callback) callback(false);
                        }
                    });
            },
            //设置名称映射
            setNameMapping(fileName, name) {
                if(!fileName && !name) return;
                $mapping[fileName] = name;
                this.saveMapping();
            },
            //保存版本号配置
            saveVersion() {
                this.saveConfig('version');
            },
            //格式化下载信息
            formatDT(data) {
                var msg = data.split("^^^");
                if(msg.length === 2) return `${msg[0]}<br><span class="download-msg">${msg[1]}</span>`;
                return msg[0];
            },
            handleSelectionChange(checked) {
                this.checked = checked;
            },
            //全部更新检查
            checkAll() {
                //
                this.tableList.forEach(
                    (row, i) => {
                        this.getOnlineData(row);
                    }
                );
            },
            //全部更新
            updateAll() {
                if(this.checked instanceof Array && this.checked.length > 0) {
                    console.log(this.checked);
                    this.checked.forEach(
                        (row) => {
                            if(this.checkIsUpdate(row)) {
                                //row.index
                                this.upDateFiles(row);
                            }
                        }
                    );
                } else {
                    alert("请选择需要更新的插件");
                }
            },
            //名称修改
            editName(row, isReset) {
                var name = isReset ? row.localName : row.editName;
                if(!name) return $msg("名称不能为空");
                $mapping[row.localName] = name;
                row.name = name;
                row.popover = false;
                this.saveMapping();
                this.refresh();
            },
            //保存名称映射配置
            saveMapping() {
                this.saveConfig('mapping');
            },
            //获取插件名称
            getName(row) {
                if(row.searchName) return `${row.searchName}(${row.localName})`;
                if(row.name !== row.localName) return `${row.name}(${row.localName})`;
                return row.name;
            },
            getDependencies(row) {
                if(row.RequiredDeps instanceof Array) return row.RequiredDeps.join(",");
                if(row.Dependencies instanceof Array) return row.Dependencies.join(",");
                return "";
            },
            //设置忽略
            filterFiles(row) {
                $filter[row.localName] = true;
                row.isFilter = true;
                this.saveFilter();
                this.refresh();
            },
            //保存忽略列表配置
            saveFilter() {
                this.saveConfig('filter');
            },
            //取消忽略
            delFilterFiles(row) {
                delete $filter[row.localName];
                row.isFilter = false;
                this.saveFilter();
                this.refresh();
            },
            //版本号文件颜色判断
            getVersionColor(row) {
                var check = this.checkIsUpdate(row);
                if(check === true) return '#da0606';
                else if(check === null) return '#606266';
                return '#0cbd75';
            },
            //获取分页数据
            getTable() {
                var data;
                if(this.tableData.length < this.size) {
                    data = this.tableData;
                } else {
                    var end   = this.size * this.page,
                        start = end - this.size;
                    data = this.tableData.slice(start, end);
                }
                for (var i in data) {
                    data[i].index = i;
                }
                return data;
            },
            //获取插件总数
            getTotal() {
                if(!this.tableData) return 0;
                var l = this.tableData.length;
                return l;
            },
            //打开插件目录
            openDir(row) {
                $openDir(this.wowPath + "/" + row.localName + "/" + row.localName + ".toc");
            },
            //搜索列表折叠
            searchFold(i) {
                if(this.searchTabs === i && this.searchShow)
                    this.searchShow = !this.searchShow;
                else
                    this.searchShow = true;
                this.searchTabs = i;
            },
            downloadFold() {
                this.downloadShow = !this.downloadShow;
            },
            searchAddons() {
                if(this.searchText === "") return $msg("搜索内容不能为空");
                this.searchLoading = true;
                if(this.searching) this.searching.abort();
                this.searching = this.setSearch(
                    this.searchText,
                    (list) => {
                        delete this.searching;
                        for (var i in list) {
                            list[i].index = i;
                            if(this.checkExist(list[i].searchName)) list[i].hasExist = true;
                        }
                        this.searchList = list;
                        this.searchLoading = false;
                    }
                );
            },
            addSearch(row) {
                this.addDownload(row);
            },
            addDownload(data, target) {
                if(this.isDownload(data)) return;
                var row = $clone(data);
                row.index = this.downloadList.length;
                this.downloadList.push(row);
                this.setDownloadType(row.index, "获取插件版本", "download");
                this.downloadShow = true;
                downloadList[row.name] = this.getVersionList(
                    row.name,
                    (list) => {
                        if(!list || list.length === 0) return this.removeDownload(row);
                        this.setDownloadType(row.index, "准备下载插件", "download");
                        row.onlineVersionList = list;
                        row.onlineVersion = list[0].download;
                        this.upDateFiles(row,
                            (e, fileName) => {
                                if(e) {
                                    this.removeDownload(row);
                                    this[target || "searchList"][data.index].hasExist = true;
                                    this.addData(row, fileName);
                                } else {
                                }
                            }, "download");
                    },
                    row.isOtherAddons ? data : null
                );
            },
            removeDownload(row) {
                delete downloadList[row.name];
                this.downloadList[row.index] = null;
                this.setDownloadType(row.index, false, "download");
            },
            cancelDownload(row) {
                $abortDownload(row.name);
                this.removeDownload(row);
            },
            isDownload(row) {
                if(downloadList[row.name] && !(downloadList[row.name] instanceof Array)) return true;
                return false;
            },
            getDownloadCount() {
                var count = 0;
                this.downloadList.forEach(
                    (a) => {
                        if(a) count++;
                    }
                );
                return count;
            },
            //检查插件是否存在
            checkExist(name) {
                //name = $mapping[name] || name;
                for (var k in this.interface) {
                    if(
                        this.interface[k].name === name ||
                        this.interface[k].name === name
                    ) return true;
                }
                return false;
            },
            //删除插件
            delInterface(row) {
                var name = row.localName;
                //row.localName
                var map = this.dependenciesMap[name];
                //基础包依赖
                var delList = map || [];
                delList.push(name);
                //依赖包依赖
                delList.forEach(
                    (name) => {
                        if(this.dependenciesMap[name]) {
                            this.dependenciesMap[name].forEach(
                                (a) => {
                                    if(delList.indexOf(a) === -1) delList.push(a);
                                }
                            );
                        }
                    }
                );
                this.$confirm(`确认是否删除插件 - ${name}?`, '提示', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    type: 'warning'
                }).then(() => {
                    this.del(delList);
                }).catch(() => {
                });
            },
            del(delList) {
                delList.forEach(
                    (name) => {
                        var path = this.wowPath + "\\" + name;
                        $deleteFile(path);
                        delete $mapping[name];
                        delete $version[name];
                    }
                );
                var newData = [];
                for (var i in this.tableData) {
                    //console.log(delList.indexOf(this.tableData[i].localName), this.tableData[i].localName);
                    if(delList.indexOf(this.tableData[i].localName) === -1) {
                        newData.push(this.tableData[i]);
                    }
                }
                this.tableData = newData;
                this.tableList = this.getTable();
                this.refresh();
                this.saveConfig();
            },
            checkedDelAll() {
                if(this.checked instanceof Array && this.checked.length > 0) {
                    var delList = [];
                    this.checked.forEach(
                        (row) => {
                            delList.push(row.localName);
                        }
                    );
                    this.$confirm(`确认是否删除插件 - ${delList.join(",")}?`, '提示', {
                        confirmButtonText: '确定',
                        cancelButtonText: '取消',
                        type: 'warning'
                    }).then(() => {
                        this.del(delList);
                    }).catch(() => {
                    });
                } else {
                    alert("请选择需要删除的插件");
                }
            },
            //清空插件
            delAll() {
                this.$prompt('确定要清除所有插件,请输入 delete 后确认', '提示', {
                    confirmButtonText: '确定',
                    cancelButtonText: '取消',
                    inputPattern: /^delete$/i,
                    inputErrorMessage: '输入有误'
                }).then(({value}) => {
                    $deleteFile(this.wowPath);
                    $mapping = {};
                    $version = {};
                    this.saveConfig();
                    this.refreshAll();
                }).catch(() => {
                });
            },
            addData(row, fileName) {
                row.localName = fileName;
                row.Version = $version[fileName];
                this.interface[fileName] = row;
                var data = [row].concat(this.tableData);
                for (var i in data) {
                    data[i].index = i;
                }
                this.tableData = data;
                this.tableList = this.getTable();
                this.refresh();
            },
            saveConfig(type) {
                if(type === 'mapping' || type === undefined)
                    this.config.mapping = $mapping;
                if(type === 'version' || type === undefined)
                    this.config.version = $version;
                if(type === 'filter' || type === undefined)
                    this.config.filter = $filter;
                $setConfig(this.config);
            },
            //常用插件
            addOtherAddons(row) {
                this.addDownload(row, "otherAddons");
            },
            clearThisAll() {
                for (var k in this.checklist) {
                    this.clearCheckGet(k);
                }
                this.downloadType = [];
                this.loading = [];
            }
        },
        watch: {
            "wowPath": function(val, old) {
                if(val === "") return;
                this.updateList();
            },
            "loading": function() {
                this.refresh();
            },
            "page": function() {
                this.clearThisAll();
                this.tableList = this.getTable();
            },
            "size": function() {
            },
            "release": function(val) {
                this.config.release = val;
                $setConfig(this.config);
            }
        }
    }
);

function $clone(data) {
    try {
        return JSON.parse(JSON.stringify(data));
    } catch(e) {
        return {};
    }
}

function $msg(str) {
    vue.$message(str);
}