// log4js
let log4js = require('log4js');
let logger = log4js.getLogger('HyperledgerWebApp');
// express
let express = require('express');
let session = require('express-session');
let cookieParser = require('cookie-parser');
let bodyParser = require('body-parser');
let http = require('http');
let util = require('util');
let uuid = require('node-uuid');
let request = require('request');

let crypto = require('crypto');

let expressJWT = require('express-jwt');
let jwt = require('jsonwebtoken');
let bearerToken = require('express-bearer-token');
let cors = require('cors');
let path = require('path');
let hfc = require('fabric-client');
let app = express();
//let txarray = [];
let secretKey = "wadhotgfxgmbvsegdswtilnbczaej";
//let txNum = 0;
hfc.addConfigFile(path.join(__dirname, 'config.json'));
var helper = require('./app/helper.js');
var channels = require('./app/create-channel.js');
var join = require('./app/join-channel.js');
var install = require('./app/install-chaincode.js');
var instantiate = require('./app/instantiate-chaincode.js');
var upgrade = require('./app/update-chaincode.js');
var invoke = require('./app/invoke-transaction.js');
var query = require('./app/query.js');
var obj = {"num": 0, "hash": "0", "time": "0", "txnum": 0};
var chanList = hfc.getConfigSetting("channels");
var allChanTx = {};
var getChatBlockHeight = 0;
var allChatBlock = {};
var allChatTx = {};
var defaultChannelId = "channel";

let peer = "peer";
let cuurentBlocknum = 0;
logger.debug('chanList  : ' + chanList);
if (chanList && chanList.length > 0) {
    defaultChannelId = chanList[0]["channelId"];
    // chanList
    for (const index in chanList) {
        logger.debug('chan  : ' + chanList[index]);
        logger.debug('chan.channelId  : ' + chanList[index].channelId);
        allChanTx[chanList[index].channelId] = {}
        allChanTx[chanList[index].channelId]["blockHeight"] = 0;
        allChanTx[chanList[index].channelId]["txNum"] = 0;
        allChanTx[chanList[index].channelId]["hadReadHeight"] = 0;
    }
}

let host = process.env.HOST || hfc.getConfigSetting('host');
let port = process.env.PORT || hfc.getConfigSetting('port');

app.options('*', cors());
app.use(cors());
//support parsing of application/json type post data
app.use(bodyParser.json());
//support parsing of application/x-www-form-urlencoded post data
app.use(bodyParser.urlencoded({
    extended: false
}));
// set secret variable
app.set('secret', secretKey);
// login 
//app.use(expressJWT({secret: secretKey}).unless({path: ['/login', '/blocktxnum', '/blockchat']}));
app.use(bearerToken());
app.use(function (req, res, next) {
    if (req.originalUrl.indexOf('/login') >= 0 || req.originalUrl.indexOf('/blocktxnum') >= 0 || req.originalUrl.indexOf('/blockchat') >= 0) {
        return next();
    }
    let token = req.token;
    if (!token || token === ""){
        req.username = "admin";
        req.orgname = "lianbaiOrg";
        return next();
    }
    jwt.verify(token, app.get('secret'), function (err, decoded) {
        logger.info(decoded);
        if (err) {
            res.send({
                success: false,
                info: 'Failed to authenticate token. Make sure to include the ' +
                    'token returned from /login call in the authorization header ' +
                    ' as a Bearer token'
            });
            return;
        } else {
            // add the decoded user name and org name to the request object
            // for the downstream code to use
            req.username = decoded.username;
            req.orgname = decoded.orgName;
            logger.debug(util.format('Decoded from JWT token: username - %s, orgname - %s', decoded.username, decoded.orgName));
            return next();
        }
    });
});
///////////////////////////////////////////////////////////////////////////////
//////////////////////////////// START SERVER /////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
var server = http.createServer(app).listen(port, function () {
});

logger.info('****************** SERVER STARTED ************************');
logger.info('**************  http://' + host + ':' + port + '  ******************');
server.timeout = 240000;

function getErrorMessage(field) {
    var response = {
        success: false,
        info: field + ' field is missing or Invalid in the request'
    };
    return response;
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////// REST ENDPOINTS START HERE ///////////////////////////
///////////////////////////////////////////////////////////////////////////////
// Register and enroll user
app.post('/login', function (req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var orgName = req.body.orgName;
    logger.debug('End point : /login');
    logger.debug('User name : ' + username);
    logger.debug('Org name  : ' + orgName);
    if (!username) {
        res.json(getErrorMessage('\'username\''));
        return;
    }
    if (!orgName) {
        res.json(getErrorMessage('\'orgName\''));
        return;
    }
    //support!?~@lianbai.io
    // if(username !=="lianbai.io" || password !=="885ede03c54b2c7f05ce3c0c34dc4762"){
    //    res.json({
    // 		success:false,
    //        info : "username or password wrong"
    // 	});
    //    return;
    // }
    var token = jwt.sign({
        exp: Math.floor(Date.now() / 1000) + parseInt(hfc.getConfigSetting('jwt_expiretime')),
        username: username,
        orgName: orgName
    }, app.get('secret'));

    helper.getRegisteredUsers(username, orgName, true, password).then(function (response) {
        if (response && typeof response !== 'string') {
            response.token = token;
            res.send(response);
        } else {
            res.json({
                success: false,
                info: response
            });
        }
    });
});
let addOrg = require("./app/add-org.js");
// Register and enroll user
app.post('/addOrg', function (req, res) {
    let domain;
    let channelName;
    let projectID;

    if (req.body.domain) {
        domain = req.body.domain;
    } else {
        res.json({success:false, message:"no  domain filed"});
    }

    if (req.body.channelName) {
        channelName = req.body.channelName;
    } else {
        res.json({success:false, message:"no  channelName filed"});
    }

    if (req.body.projectID) {
        projectID = req.body.projectID;
    } else {
        res.json({success:false, message:"no  projectID filed"});
    }

    addOrg.AddNewOrg(domain, channelName, "add", projectID);
    res.json({success:true});
});
// Create Channel
app.post('/channels', function (req, res) {
    logger.info('<<<<<<<<<<<<<<<<< C R E A T E  C H A N N E L >>>>>>>>>>>>>>>>>');
    var channelName;
    var channelConfigPath;
    if (req.body.channelName) {
        channelName = req.body.channelName;
    } else {
        channelName = defaultChannelId; //Channel
    }

    for (const chanindex in chanList) {
        var chan = chanList[chanindex];
        if (chan["channelId"] == channelName) {
            channelConfigPath = chan["channelConfigPath"];
            break;
        }
    }
    logger.debug('Channel name : ' + channelName);
    logger.debug('channelConfigPath : ' + channelConfigPath); //channelConfigPath
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!channelConfigPath) {
        res.json(getErrorMessage('\'channelConfigPath\''));
        return;
    }

    channels.createChannel(channelName, channelConfigPath, req.username, req.orgname)
        .then(function (message) {
            res.json(message);
            // if (message && typeof message !== 'string') {
            // 	res.json(message);
            // } else {
            // 	logger.info(message);
            // 	let jmsg = JSON.parse(message);
            // 	if (jmsg && typeof jmsg !== 'string') {
            // 		res.json(jmsg);
            // 	}
            // 	else {
            // 		res.json({
            // 			success: false,
            // 			info: jmsg
            // 		});
            // 	}
            // }
        });
});
// Join Channel
app.post('/channels/peers', function (req, res) {
    logger.info('<<<<<<<<<<<<<<<<< J O I N  C H A N N E L >>>>>>>>>>>>>>>>>');
    var channelName;
    if (req.body.channelName) {
        channelName = req.body.channelName;
    } else {
        channelName = defaultChannelId; //Channel
    }

    var peers = req.body.peers;
    var orgname = req.orgname;
    if (req.body.orgname) {
        orgname = req.body.orgname;
    }

    logger.debug('channelName : ' + channelName);
    logger.debug('peers : ' + peers);
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!peers || peers.length == 0) {
        res.json(getErrorMessage('\'peers\''));
        return;
    }

    join.joinChannel(channelName, peers, req.username, orgname)
        .then(function (message) {
            res.json(message);
            // if (message && typeof message !== 'string') {
            // 	res.json(message);
            // } else {
            // 	logger.info(message);
            // 	let jmsg = JSON.parse(message);
            // 	if (jmsg && typeof jmsg !== 'string') {
            // 		res.json(jmsg);
            // 	}
            // 	else {
            // 		res.json({
            // 			success: false,
            // 			info: jmsg
            // 		});
            // 	}
            // }
        });
});
// Install chaincode on target peers
app.post('/chaincodes', function (req, res) {
    logger.debug('==================== INSTALL CHAINCODE ==================');
    var peers = req.body.peers;

    var chaincodeName = req.body.chaincodeName;
    var chaincodePath = req.body.chaincodePath;
    var chaincodeVersion = req.body.chaincodeVersion;
    logger.debug('peers : ' + peers); // target peers list
    logger.debug('chaincodeName : ' + chaincodeName);
    logger.debug('chaincodePath  : ' + chaincodePath);
    logger.debug('chaincodeVersion  : ' + chaincodeVersion);
    if (!peers || peers.length == 0) {
        res.json(getErrorMessage('\'peers\''));
        return;
    }
    if (!chaincodeName) {
        res.json(getErrorMessage('\'chaincodeName\''));
        return;
    }
    if (!chaincodePath) {
        res.json(getErrorMessage('\'chaincodePath\''));
        return;
    }
    if (!chaincodeVersion) {
        res.json(getErrorMessage('\'chaincodeVersion\''));
        return;
    }

    install.installChaincode(peers, chaincodeName, chaincodePath, chaincodeVersion, req.username, req.orgname)
        .then(function (message) {
            res.json(message);
            // if (message && typeof message !== 'string') {
            // 	res.json(message);
            // } else {
            // 	logger.info(message);
            // 	let jmsg = JSON.parse(message);
            // 	if (jmsg && typeof jmsg !== 'string') {
            // 		res.json(jmsg);
            // 	}
            // 	else {
            // 		res.json({
            // 			success: false,
            // 			info: jmsg
            // 		});
            // 	}
            // }
        });
});
// Instantiate chaincode on target peers
app.post('/channels/chaincodes', function (req, res) {
    logger.debug('==================== INSTANTIATE CHAINCODE ==================');
    var chaincodeName = req.body.chaincodeName;
    var chaincodeVersion = req.body.chaincodeVersion;
    var channelName;
    if (req.body.channelName) {
        channelName = req.body.channelName;
    } else {
        channelName = defaultChannelId; //channelName
    }
    var fcn = req.body.fcn;
    var args = req.body.args;
    logger.debug('channelName  : ' + channelName);
    logger.debug('chaincodeName : ' + chaincodeName);
    logger.debug('chaincodeVersion  : ' + chaincodeVersion);
    logger.debug('fcn  : ' + fcn);
    logger.debug('args  : ' + args);
    if (!chaincodeName) {
        res.json(getErrorMessage('\'chaincodeName\''));
        return;
    }
    if (!chaincodeVersion) {
        res.json(getErrorMessage('\'chaincodeVersion\''));
        return;
    }
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!args) {
        res.json(getErrorMessage('\'args\''));
        return;
    }
    instantiate.instantiateChaincode(channelName, chaincodeName, chaincodeVersion, fcn, args, req.username, req.orgname)
        .then(function (message) {
            if (message && typeof message !== 'string') {
                res.json(message);
            } else {
                logger.info(message);
                try {
                    let jmsg = JSON.parse(message);
                    if (jmsg && typeof jmsg !== 'string') {
                        res.json(jmsg);
                    }
                    else {
                        res.json({
                            success: false,
                            info: jmsg
                        });
                    }
                } catch (e) {
                    res.json({
                        success: false,
                        info: message
                    });
                }

            }
        });
});
// UPdate chaincode on target peers
app.put('/channels/chaincodes', function (req, res) {
    logger.debug('==================== UPGRADE CHAINCODE ==================');
    var chaincodeName = req.body.chaincodeName;
    var chaincodeVersion = req.body.chaincodeVersion;
    var channelName;
    if (req.body.channelName) {
        channelName = req.body.channelName;
    } else {
        channelName = defaultChannelId; //channelName
    }

    var fcn = req.body.fcn;
    var args = req.body.args;
    logger.debug('channelName  : ' + channelName);
    logger.debug('chaincodeName : ' + chaincodeName);
    logger.debug('chaincodeVersion  : ' + chaincodeVersion);
    logger.debug('fcn  : ' + fcn);
    logger.debug('args  : ' + args);
    if (!chaincodeName) {
        res.json(getErrorMessage('\'chaincodeName\''));
        return;
    }
    if (!chaincodeVersion) {
        res.json(getErrorMessage('\'chaincodeVersion\''));
        return;
    }
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!args) {
        res.json(getErrorMessage('\'args\''));
        return;
    }

    upgrade.updateChaincode(channelName, chaincodeName, chaincodeVersion, req.username, req.orgname)
        .then(function (message) {
            if (message && typeof message !== 'string') {
                res.json(message);
            } else {
                logger.info(message);
                try {
                    let jmsg = JSON.parse(message);
                    if (jmsg && typeof jmsg !== 'string') {
                        if(cuurentBlocknum>0){
                            cuurentBlocknum++;
                        }
                        res.json(jmsg);
                    }
                    else {
                        res.json({
                            success: false,
                            info: jmsg
                        });
                    }
                } catch (e) {
                    res.json({
                        success: false,
                        info: message
                    })
                }

            }
        });
});
// Invoke transaction on chaincode on target peers
app.post('/channels/:channel/chaincodes/:chaincodeName', async function (req, res) {
    logger.debug('==================== INVOKE ON CHAINCODE ==================');
    var peers = req.body.peers;
    var chaincodeName = req.params.chaincodeName;
    var channelName = req.params.channel;
    var fcn = req.body.fcn;
    let args = req.body.args;
    logger.debug('args  : ' + args);
    if (!chaincodeName) {
        res.json(getErrorMessage('\'chaincodeName\''));
        return;
    }
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!fcn) {
        res.json(getErrorMessage('\'fcn\''));
        return;
    }
    if (!args) {
        res.json(getErrorMessage('\'args\''));
        return;
    }
    let channel = '';
    let include = "";
    let target = "";
    for (let index = 0; index < chanList.length; index++) {
        if (chanList[index].channelId === channelName) {
            include = chanList[index].includes[0];
            target = helper.buildTarget("peer", include);
            let client = helper.getClientForOrg(include);
            channel = client.getChannel(channelName);
            break
        }
    }
    invoke.invokeChaincodeCTK(peers, channelName, chaincodeName, fcn, [JSON.stringify(args)], "admin", "org")
        .then(function (message) {
            if (message && typeof message !== 'string') {
                res.json(message);
            } else {
                logger.info(message);
                let jmsg = JSON.parse(message);
                if (jmsg && typeof jmsg !== 'string') {
                    if (!jmsg.success) {
                        res.json({
                            success: false,
                            list: jmsg
                        });
                    }
                    else {
                        res.json(jmsg);
                    }
                }
                else {
                    res.json({
                        success: false,
                        info: message
                    });
                }
            }
        });
});



// txid
app.get('/tx/transactionid', async function (req, res) {
    logger.debug('==================== INVOKE ON CHAINCODE ==================');
    let client = helper.getClientForOrg("org");
    let txid = null;
    await helper.getOrgAdmin("org").then((user) => {
        txid = client.newTransactionID();
    });
    console.log("txid:",txid);
    let nonce = txid._nonce.toString('hex');
    // let buffer = Buffer.from(nonce, "hex");
    // console.log(buffer);
    res.json({
        success: true,
        txid: txid._transaction_id,
        nonce: nonce,
    });
});

// post Query on chaincode on target peers
app.post('/query/channels/:channel/chaincodes/:chaincodeName', function (req, res) {
    logger.debug('==================== QUERY BY CHAINCODE ==================');
    var channelName = req.params.channel;
    var chaincodeName = req.params.chaincodeName;
    if (!req.body.args[0]) {
        if (!chaincodeName) {
            res.json(getErrorMessage('\'args\''));
            return;
        }
    }
    let args = [JSON.stringify(req.body.args[0])];
    let fcn = req.body.fcn;
    let org = "org";
    //let peer = req.body.peer;

    logger.debug('channelName : ' + channelName);
    logger.debug('chaincodeName : ' + chaincodeName);
    logger.debug('fcn : ' + fcn);
    logger.debug('args : ' + args);

    if (!chaincodeName) {
        res.json(getErrorMessage('\'chaincodeName\''));
        return;
    }
    if (!channelName) {
        res.json(getErrorMessage('\'channelName\''));
        return;
    }
    if (!fcn) {
        res.json(getErrorMessage('\'fcn\''));
        return;
    }
    if (!args) {
        res.json(getErrorMessage('\'args\''));
        return;
    }

    query.queryChaincode(peer, channelName, chaincodeName, args, fcn, "admin", org)
        .then(function (message) {
            logger.info(message);
            if (message && typeof message !== 'string') {
                res.json({
                    success: true,
                    info: message
                });
            } else {
                logger.info(message);
                try {
                    let jmsg = JSON.parse(message);
                    if (jmsg && typeof jmsg !== 'string') {
                        res.json({
                            success: true,
                            list: jmsg
                        });
                    }
                    else {
                        res.json({
                            success: false,
                            list: jmsg
                        });
                    }
                } catch (e) {
                    console.log(message);
                    res.json({
                        success: false,
                        list: message,
                        info: "json error"
                    });
                }
            }
        });
});

// Query Block Transactions by BlockNumber
app.get('/txlist/channels/:channelId/blocks/:blockId/appname/:appname', function (req, res) {
    logger.debug('======================== GET BLOCK TRANSACTIONS BY BLOCK NUM ========');
    let blockid = req.params.blockId;
    //  let peer = req.query.peer;
    let appname = req.params.appname;
    let rwset = [];
    let kvwrites = [];
    let txlist = [];

    console.log(appname);
    logger.debug('BlockID:' + blockid);
    if (!blockid) {
        res.json(getErrorMessage('\'blockid\''));
        return;
    }

    query.getBlockByNumber(peer, blockid, req.username, req.orgname, req.params.channelId)
        .then(function (message) {
            if (message && typeof message !== 'string') {

                rwset = message.data.data[0].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;
                for (let i = 0; i < rwset.length; i++) {
                    if (rwset[i].namespace === appname) {
                        kvwrites = rwset[i].rwset.writes;
                        break;
                    }
                    continue;
                }
                for (let i = 0; i < kvwrites.length; i++) {
                    console.log(kvwrites[i].key);
                    if (kvwrites[i].key.indexOf("ALL_TX_IN_BLOCK") === 0) {
                        console.log(kvwrites[i].value, "" + "");
                        txlist.push(JSON.parse(kvwrites[i].value).block_tx);
                    }
                }
                res.json({
                    success: true,
                    list: txlist
                });
            } else {
                logger.info(message);
                let jmsg = JSON.parse(message);
                console.log(jmsg);

                if (jmsg && typeof jmsg !== 'string') {
                    res.json({
                        success: false,
                        data: jmsg
                    });
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});


//  Query Get Block by BlockNumber
app.get('/channels/:channelId/blocks/:blockId/appname/:appname', function (req, res) {
    logger.debug('==================== GET BLOCK BY NUMBER ==================');
    let blockId = req.params.blockId;
    //   let peer = req.query.peer;
    let appname = req.params.appname;
    let txarray = [];

    let txnum = 0;
    let obj = {"num": 0, "hash": "0", "time": "0", "txnum": 0};
    let rwset = [];
    console.log(appname);
    logger.debug('BlockID : ' + blockId);
    logger.debug('Peer : ' + peer);
    if (!blockId) {
        res.json(getErrorMessage('\'blockId\''));
        return;
    }

    query.getBlockByNumber(peer, blockId, "admin", "org", req.params.channelId)
        .then(function (message) {
       
            if (message && typeof message !== 'string') {
                
                //
                rwset = message.data.data[0].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;
                for (let j = 0; j < rwset.length; j++) {
                    if (rwset[j].namespace === appname) {
                        console.log(rwset[j].namespace);
                        txarray = rwset[j].rwset.writes;
                        break;
                    }
                    continue;
                }
               
                for (let i = 0; i < txarray.length; i++) {
                    if (txarray[i].key.indexOf("TXHASH") === 0) {
                        txnum++;
                    }
                }
                var dateString;
                dateString = message.data.data[0].payload.header.channel_header.timestamp;
                var d = new Date(dateString);
                var time = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();

                obj.num = message.header.number;
                obj.hash = message.header.data_hash;
                obj.time = time;
                obj.txnum = txnum;
                console.log(obj,"===================");
                res.json(obj);
                return;
            } else {
                logger.info(message);
                let jmsg = JSON.parse(message);
                console.log(jmsg);

                if (jmsg && typeof jmsg !== 'string') {
                    res.json(obj);
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

// Query Get Transaction by Transaction ID
app.get('/channels/:channelName/appname/:appname/block/:blockID', function (req, res) {
    logger.debug('================ GET TRANSACTION BY TRANSACTION_ID ======================');
    //  let peer = req.query.peer;
    let appname = req.params.appname;
    let channelName = req.params.channelName;
    let write = [];
    let obj = {};
    query.getBlockByNumber(peer, req.params.blockID, "admin", "org", req.params.channelName)
        .then(function (message) {
            if (message && typeof message !== 'string') {
                let rwset = message.data.data[0].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;
                for (let i = 0; i < rwset.length; i++) {
                    if (rwset[i].namespace === appname) {
                        write = rwset[i].rwset.writes;
                        break;
                    }
                    continue;
                }
                for (let i = 0; i < write.length; i++) {
                    console.log(write[i].key);
                    if (write[i].key.indexOf("fromtransactions") == 0 || write[i].key.indexOf("totransactions") == 0 ) {
                        obj = JSON.parse(write[i].value);
                        break;
                    }
                    continue;
                }
            
                res.json({
                    success: true,
                    list: [obj]
                });
            } else {
                logger.info(message);
                let jmsg = message;
                if (jmsg && typeof jmsg !== 'string') {
                    res.json({
                        success: false,
                        list: jmsg
                    });
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

// Query Get Transaction by Transaction ID
app.get('/channels/:channelName/appname/:appname/transactions/:trxnId', function (req, res) {
    logger.debug('================ GET TRANSACTION BY TRANSACTION_ID ======================');
    let trxnId = req.params.trxnId;
    //  let peer = req.query.peer;
    let appname = req.params.appname;
    let channelName = req.params.channelName;
    let write = [];
    let obj = {};
    if (!trxnId) {
        res.json(getErrorMessage('\'trxnId\''));
        return;
    }
    console.log(appname);
    query.getTransactionByID(channelName, "peer", trxnId, "admin", "org")
        .then(function (message) {
            console.log("message",message,trxnId);
            if (message && typeof message !== 'string') {
                let rwset = message.transactionEnvelope.payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;
                for (let i = 0; i < rwset.length; i++) {
                    if (rwset[i].namespace === appname) {
                        write = rwset[i].rwset.writes;
                        break;
                    }
                    continue;
                }
                for (let i = 0; i < write.length; i++) {
                    console.log(write[i].key);
                    if (write[i].key.indexOf("fromtransactions") == 0 || write[i].key.indexOf("totransactions") == 0 ) {
                        obj = JSON.parse(write[i].value);
                        break;
                    }
                    continue;
                }
            
                res.json({
                    success: true,
                    list: [obj]
                });
            } else {
                logger.info(message);
                let jmsg = message;
                if (jmsg && typeof jmsg !== 'string') {
                    res.json({
                        success: false,
                        list: jmsg
                    });
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

// Query Get Block by Hash
app.get('/channels/blocks/:hash', function (req, res) {
    logger.debug('================ GET BLOCK BY HASH ======================');
    let hash = req.params.hash;
    console.log("hash:",hash);
    //  let peer = req.query.peer;
    if (!hash) {
        res.json(getErrorMessage('\'hash\''));
        return;
    }
    query.getBlockByHash("peer", hash, "admin", "org","sxlchannel").then(
        function (message) {
            if (message && typeof message !== 'string') {
                res.json(message);
            } else {
                if(message == undefined){
                    res.json({
                        success: false,
                        info: "block not exist！"
                    });
                    return;
                }
                console.log("message:",message);
                let jmsg = JSON.parse(message);
                if (jmsg && typeof jmsg !== 'string') {
                    res.json(jmsg);
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

//Query for Channel Information
app.get('/channels/:channelId/chaininfo', function (req, res) {
    logger.debug('================ GET CHANNEL INFORMATION ======================');

    //  let peer = req.query.peer;
    let channelId = req.params.channelId;

    query.getChainInfo(channelId, peer, req.username, req.orgname).then(
        function (message) {
            if (message && typeof message !== 'string') {
                res.json(message);
            } else {
                logger.info(message);
                let jmsg = JSON.parse(message);
                if (jmsg && typeof jmsg !== 'string') {
                    res.json(jmsg);
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

// Query to fetch all Installed/instantiated chaincodes
app.get('/channel/:channelId/chaincodes', function (req, res) {
    //   var peer = req.query.peer;
    var installType = req.query.type;
    //TODO: add Constnats
    if (installType === 'installed') {
        logger.debug('================ GET INSTALLED CHAINCODES ======================');
    } else {
        logger.debug('================ GET INSTANTIATED CHAINCODES ======================');
    }

    query.getInstalledChaincodes(req.params.channelId, peer, installType, req.username, req.orgname)
        .then(function (message) {
            if (message && typeof message !== 'string') {
                res.json({"chaincodeNum": message.length});
            } else {
                logger.info(message);
                let jmsg = JSON.parse(message);
                if (jmsg && typeof jmsg !== 'string') {
                    res.json(jmsg);
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

// Query to fetch channels
app.get('/channels', function (req, res) {
    logger.debug('================ GET CHANNELS ======================');
    logger.debug('peer: ' + req.query.peer);
    //   var peer = req.query.peer;
    if (!peer) {
        res.json(getErrorMessage('\'peer\''));
        return;
    }
    query.getChannels(peer, req.username, req.orgname)
        .then(function (message) {
            if (message && typeof message !== 'string') {
                res.json(message);
            } else {
                logger.info(message);
                let jmsg = JSON.parse(message);
                if (jmsg && typeof jmsg !== 'string') {
                    res.json(jmsg);
                }
                else {
                    res.json({
                        success: false,
                        info: jmsg
                    });
                }
            }
        });
});

app.get('/blocktxnum', async function (req, res) {
    logger.debug('================ GET All CHANNEL BLOCK Number ======================');
    // logger.debug(allChanTx);
    var allBlockNum = 0;
    var allTxNum = 0;
    for (let index = 0; index < chanList.length; index++) {
        const chan = chanList[index];
        if (chan.includes && chan.includes[0]) {
            var client = helper.getClientForOrg(chan.includes[0]);
            var target = helper.buildTarget("peer", chan.includes[0]);
            var channel = client.getChannel(chan.channelId);
            if (!channel) {
                continue;
            }
            let blocknum = await helper.getChannelInfo(channel, target, chan.includes[0]);
            // chan blockheight
            if (blocknum != null) {
                allChanTx[chan.channelId]["blockHeight"] = blocknum;
                allBlockNum = allBlockNum + blocknum;
                allTxNum = allTxNum + allChanTx[chan.channelId]["txNum"]; //transcations number
                for (let index = allChanTx[chan.channelId]["hadReadHeight"]; index < blocknum; index++) {
                    let txNum = await helper.getBlockTx(channel, index, chan.includes[0]);
                    if (txNum != null) {
                        allTxNum = allTxNum + txNum;
                        allChanTx[chan.channelId]["txNum"] = allChanTx[chan.channelId]["txNum"] + txNum;
                    }
                }
                allChanTx[chan.channelId]["hadReadHeight"] = blocknum;
            } else {
                allChanTx[chan.channelId]["blockHeight"] = 0;
                allChanTx[chan.channelId]["txNum"] = 0;
                allChanTx[chan.channelId]["hadReadHeight"] = 0;
            }
        }
    }
    res.json({
        "blockHeight": allBlockNum,
        "txNum": allTxNum
    });
});

app.get('/blockchat', async function (req, res) {
    logger.debug('================ GET All CHANNEL Chat ======================');
    // logger.debug(allChatBlock);
    // logger.debug(allChatTx);
    for (let index = 0; index < chanList.length; index++) {
        const chan = chanList[index];
        if (chan.includes && chan.includes[0]) {
            var client = helper.getClientForOrg(chan.includes[0]);
            var target = helper.buildTarget("peer0", chan.includes[0]);
            var channel = client.getChannel(chan.channelId);
            if (!channel) {
                continue;
            }
            let blocknum = await helper.getChannelInfo(channel, target, chan.includes[0]);
            if (blocknum != null) {
                for (let index = getChatBlockHeight; index < blocknum; index++) {
                    let blocktxObj = await helper.getBlockDateNumber(channel, index, chan.includes[0]);
                    // logger.debug('blocktxObj: ' + blocktxObj);
                    if (typeof blocktxObj == "object") {
                        // logger.debug('Object.keys(blocktxObj): ' + Object.keys(blocktxObj));
                        for (let index = 0; index < Object.keys(blocktxObj).length; index++) {
                            const elekey = Object.keys(blocktxObj)[index];
                            const eleobj = blocktxObj[elekey];

                            if (Object.keys(allChatBlock).indexOf(elekey) >= 0) {
                                allChatBlock[elekey] = allChatBlock[elekey] + 1;
                            } else {
                                allChatBlock[elekey] = 0;
                            }
                            if (Object.keys(allChatTx).indexOf(elekey) >= 0) {
                                allChatTx[elekey] = allChatTx[elekey] + eleobj["tx"];
                            } else {
                                allChatTx[elekey] = 0;
                            }

                        }
                    }
                }
                getChatBlockHeight = blocknum; //chat block height
            }
        }
    }
    res.json({
        "block": allChatBlock,
        "tx": allChatTx
    });
});


async function getBlockList(blockHeight, minBlockHeight, peer, username, orgName, channel, appname, callback, errorF) {
    let blockList = [];

    let max = blockHeight;

    console.log(minBlockHeight, "minBlockHeight ++++++++++++++++++++++++++++++++++++");

    for (; blockHeight > minBlockHeight; blockHeight--) {

        logger.debug('BlockID : ' + minBlockHeight);
        logger.debug('BlockID : ' + minBlockHeight);
        query.getBlockByNumber(peer, blockHeight, username, orgName, channel)
            .then(function (message) {
                let txarray = [];
                if (message && typeof message !== 'string') {
                    let txnum = 0;
                    let rwset = message.data.data[0].payload.data.actions[0].payload.action.proposal_response_payload.extension.results.ns_rwset;

                    for (let j = 0; j < rwset.length; j++) {
                        if (rwset[j].namespace === appname) {
                            txarray = rwset[j].rwset.writes;
                            break;
                        }
                    }
                    for (let i = 0; i < txarray.length; i++) {
                        if (txarray[i].key.indexOf("TXHASH") === 0) {
                            txnum++;
                        }
                    }
                    var dateString;
                    var item = {"num": 0, "hash": "0", "time": "0", "txnum": "0"};
                    dateString = message.data.data[0].payload.header.channel_header.timestamp;
                    var d = new Date(dateString);
                    var time = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + ' ' + d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
                    item.num = message.header.number;
                    item.hash = message.header.data_hash;
                    item.time = time;
                    item.txnum = txnum;
                    if(!blockHeightMap[item.hash]){
                        blockHeightMap[item.hash] = item["num"];
                    }
                    blockList.push(item)
                } else {
                    logger.info(message);
                    let jmsg = message;
                    console.log(jmsg);
                    if (jmsg && typeof jmsg !== 'string') {
                        return "get blocklist error";
                    }
                    else {
                        return "get blocklist error"
                    }
                }
            });
    }
    let start = new Date().getTime();
    let r = setInterval(function () {
        let end = new Date().getTime();
        if (end - start > 5 * 1000) {
            clearInterval(r);
            errorF();
        }
        if (blockList.length === max - minBlockHeight) {
            console.log("success +++++++++++ ", blockList);
            clearInterval(r);
            callback(blockList);
            // return blockList;
        }
    }, 1);

    //return blockList;
}


function compare(pro) {
    return function (obj1, obj2) {
        var val1 = parseInt(obj1[pro]);
        var val2 = parseInt(obj2[pro]);
        if (val1 < val2) { //
            return 1;
        } else if (val1 > val2) {
            return -1;
        } else {
            return 0;
        }
    }
}
let blockHeightMap = {};
app.get('/blocklist/channels/:channelId/maxblock/:maxBlockId/appname/:appname', async function (req, res) {
    // res.header("Access-Control-Allow-Origin", "*");
    // res.header("Access-Control-Allow-Headers", "Content-Type,Content-Length, Authorization, Accept,X-Requested-With, peer");
    // res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
    logger.debug('==================== GET BLOCK LIST BY MaxHeight ==================');
    //  let peer = req.query.peer;
    let appname = req.params.appname;
    let maxBlockId = parseInt(req.params.maxBlockId);
    console.log(appname);
    logger.debug('BlockID : ' + maxBlockId);
    logger.debug('Peer : ' + peer);
    if (!maxBlockId) {
        res.json(getErrorMessage('\'maxBlockId\''));
        return;
    }
    if (maxBlockId == 1) {
        res.json({
            success: true,
            list: [],
            message: "there is no more data!"
        });
    } else if (maxBlockId < 0) {
        if (cuurentBlocknum <= 0)
            for (let index = 0; index < chanList.length; index++) {
                const chan = chanList[index];
                if (chan.includes && chan.includes[0]) {
                    var client = helper.getClientForOrg(chan.includes[0]);
                    var target = helper.buildTarget("peer0", chan.includes[0]);
                    var channel = client.getChannel(chan.channelId);
                    if (!channel) {
                        continue;
                    }
                    cuurentBlocknum = await helper.getChannelInfo(channel, target, chan.includes[0]);
                }
            }
        if (cuurentBlocknum != null) {
            if (cuurentBlocknum > 10) {
                console.log("-----------------------------------", cuurentBlocknum);
                getBlockList(cuurentBlocknum - 1, cuurentBlocknum - 11, peer, req.username, req.orgname, req.params.channelId, appname, function (message) {
                    console.log("**************** test ************", message);
                    if (message && typeof message !== 'string') {
                        res.json({
                            success: true,
                            list: message.sort(compare("num"))
                        });
                    } else {
                        res.json({
                            success: false,
                            list: message
                        })
                    }
                }, function () {
                    res.json({
                        success: false,
                        message: "timeout!",
                        list: []
                    })
                });
            } else {
                console.log("blocknum:", cuurentBlocknum);
                getBlockList(cuurentBlocknum - 1, 0, peer, req.username, req.orgname, req.params.channelId, appname, function (message) {
                    console.log("**************** test ************", message);
                    if (message && typeof message !== 'string') {
                        res.json({
                            success: true,
                            list: message.sort(compare("num"))
                        });
                    } else {
                        res.json({
                            success: false,
                            list: message
                        })
                    }
                }, function () {
                    res.json({
                        success: false,
                        message: "timeout!",
                        list: []
                    })
                });

            }
        }
    } else if (maxBlockId > 10) {
        getBlockList(maxBlockId - 1, maxBlockId - 11, peer, req.username, req.orgname, req.params.channelId, appname, function (message) {
            console.log("**************** test ************", message);
            if (message && typeof message !== 'string') {
                res.json({
                    success: true,
                    list: message.sort(compare("num"))
                });
            } else {
                res.json({
                    success: false,
                    list: message
                })
            }
        }, function () {
            res.json({
                success: false,
                message: "timeout!",
                list: []
            })
        });
    } else {
        getBlockList(maxBlockId - 1, 0, peer, req.username, req.orgname, req.params.channelId, appname, function (message) {
            console.log("**************** test ************", message);
            if (message && typeof message !== 'string') {
                res.json({
                    success: true,
                    list: message.sort(compare("num"))
                });
            } else {
                res.json({
                    success: false,
                    list: message
                })
            }
        }, function () {
            res.json({
                success: false,
                message: "timeout!",
                list: []
            })
        });
    }
});
