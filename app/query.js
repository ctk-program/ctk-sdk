/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
// var path = require('path');
// var fs = require('fs');
// var util = require('util');
// var hfc = require('fabric-client');
// var Peer = require('fabric-client/lib/Peer.js');
// var EventHub = require('fabric-client/lib/EventHub.js');
var helper = require('./helper');

var logger = helper.getLogger('Query');
let transactions = {};
var queryChaincode = function (peer, channelName, chaincodeName, args, fcn, username, org) {
      let key = JSON.stringify(args)+fcn;
    if (transactions[key] && parseInt(transactions[key]['timeout']) > 0 && parseInt(+ new Date() / 1000) - parseInt(transactions[key]['timeout']) <= 3) {
        return new Promise((resolve,reject)=>{
            resolve(transactions[key]['data']);
        })
    } else {
        transactions[key] = {timeout:0,data:{}};
    }
    var channel = helper.getChannelForOrg(channelName, org);
    if (channel == null) {
        logger.error('===============channel is null======================== ',channelName,org);
        return;
    }
    return helper.getOrgAdmin(org).then((user) => {
        var target = buildTarget(peer, org);
        var request = {
            chaincodeId: chaincodeName,
            //txId: tx_id,
            fcn: fcn,
            args: args
        };
        return channel.queryByChaincode(request, target);
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response_payloads) => {
        if (response_payloads) {
            console.log("response_payloads======================================");
            for (let i = 0; i < response_payloads.length; i++) {
            	console.log(response_payloads[i].toString('utf8'));
            }

            for (let i = 0; i < response_payloads.length; i++) {
                logger.info(args[0] + ' now ' +
                    '' +
                    '' +
                    '' +
                    ' ' + response_payloads[i].toString('utf8') +
                    ' after the move');
		        transactions[key]['data'] = response_payloads[i].toString('utf8');
                transactions[key]['timeout'] = parseInt(+ new Date() / 1000);
                return response_payloads[i].toString('utf8');
            }
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to end to end test with error:' + err.stack ? err.stack :
            err);
        return 'Failed to end to end test with error:' + err.stack ? err.stack :
            err;
    });

};
var getBlockByNumber = function (peer, blockNumber, username, org, channelId) {
    var target = buildTarget(peer, org);
    var channel = helper.getChannelForOrg(channelId, org);
    if (channel == null) {
        logger.error('===============channel is null======================== ',channelId,org);
        return;
    }
    return helper.getOrgAdmin(org).then((user) => {
        // return helper.getRegisteredUsers(username, org).then((member) => {
        return channel.queryBlock(parseInt(blockNumber), target);
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response_payloads) => {
        if (response_payloads) {
            //logger.debug(response_payloads);
            return response_payloads; //response_payloads.data.data[0].buffer;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};
var getTransactionByID = function (channelName, peer, trxnID, username, org) {
    var target = buildTarget(peer, org);
    var channel = helper.getChannelForOrg(channelName, org);
    if (channel == null) {
        logger.error('===============channle is null======================== ');
        return;
    }
    return helper.getOrgAdmin(org).then((user) => {
        // return helper.getRegisteredUsers(username, org).then((member) => {
        return channel.queryTransaction(trxnID, target);
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response_payloads) => {
        if (response_payloads) {
            logger.debug(response_payloads);
            return response_payloads;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};
var getBlockByHash = function (peer, hash, username, org, channelname) {
    var target = buildTarget(peer, org);
    var channel = helper.getChannelForOrg(channelname ,org);
    console.log("***********channel:",peer,hash,username,org);
    if (channel == null) {
        logger.error('===============channle is null======================== ');
        return;
    }
    return helper.getOrgAdmin(org).then((user) => {
        // return helper.getRegisteredUsers(username, org).then((member) => {
        return channel.queryBlockByHash(Buffer.from(hash), target);
    }, (err) => {
        console.log("===============err",response_payloads);
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response_payloads) => {
        console.log("===============",response_payloads);
        if (response_payloads) {
            logger.debug(response_payloads);
            return response_payloads;
        } else {
            console.log("===============null",response_payloads);
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    }, (err) => {
        console.log("===============wee1",err);
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};
var getChainInfo = function (channel, peer, username, org) {
    var target = buildTarget(peer, org);
    var channel = helper.getChannelForOrg(channel, org);
    if (channel == null) {
        logger.error('===============channle is null======================== ');
        return;
    }
    return helper.getOrgAdmin(org).then((user) => {
        // return helper.getRegisteredUsers(username, org).then((member) => {
        return channel.queryInfo(target);
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((blockchainInfo) => {
        if (blockchainInfo) {
            // FIXME: Save this for testing 'getBlockByHash'  ?
            logger.debug('===========================================');
            logger.debug(blockchainInfo.currentBlockHash);
            logger.debug('===========================================');
            //logger.debug(blockchainInfo);
            return blockchainInfo;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};
let chainCodeNum = [];
//getInstalledChaincodes
var getInstalledChaincodes = function (channelname, peer, type, username, org) {
	if (chainCodeNum.length > 0) {
		return new Promise((resolve,reject)=>{
			resolve(chainCodeNum);
		});
	}
    var target = buildTarget(peer, org);
    var channel = helper.getChannelForOrg(channelname, org);
    if (channel == null) {
        logger.error('===============channle is null======================== ');
        return;
    }
    var client = helper.getClientForOrg(org);

    return helper.getOrgAdmin(org).then((member) => {
        if (type === 'installed') {
            return client.queryInstalledChaincodes(target);
        } else {
            return channel.queryInstantiatedChaincodes(target);
        }
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response) => {
        if (response) {
            if (type === 'installed') {
                logger.debug('<<< Installed Chaincodes >>>');
            } else {
                logger.debug('<<< Instantiated Chaincodes >>>');
            }
            for (let i = 0; i < response.chaincodes.length; i++) {
                logger.debug('name: ' + response.chaincodes[i].name + ', version: ' +
                    response.chaincodes[i].version + ', path: ' + response.chaincodes[i].path
                );
                chainCodeNum.push('name: ' + response.chaincodes[i].name + ', version: ' +
                    response.chaincodes[i].version + ', path: ' + response.chaincodes[i].path
                );
            }
            return chainCodeNum;
        } else {
            logger.error('response is null');
            return 'response is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};
var getChannels = function (peer, username, org) {
    var target = buildTarget(peer, org);

    var client = helper.getClientForOrg(org);
    logger.info(username);
    logger.info(org);
    return helper.getOrgAdmin(org).then((user) => {
        // return helper.getRegisteredUsers(username, org).then((member) => {
        //channel.setPrimaryPeer(targets[0]);
        return client.queryChannels(target);
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response) => {
        if (response) {
            logger.debug('<<< channels >>>');
            var channelNames = [];
            for (let i = 0; i < response.channels.length; i++) {
                channelNames.push('channel id: ' + response.channels[i].channel_id);
            }
            logger.debug(channelNames);
            return response;
        } else {
            logger.error('response_payloads is null');
            return 'response_payloads is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};

// var getAllChannelsInfo = function () {
// 	var AllChanInfo = [];
// 	async.eachLimit(chanList,1,function (item,callback) {
// 		let orgName = item.includes[0];
// 		let peer = "peer0";
// 		let target = buildTarget(peer, orgName);
// 		let channel = helper.getChannelForOrg(orgName);
// 		helper.getOrgAdmin(orgName).then((user) => {
// 			channel.queryInfo(target).then((blockinfo)=>{
// 				callback(blockinfo)
// 			},(err)=>{
// 				callback(err)
// 			});
// 		}, (err) => {
// 			callback(err)
// 		});
// 	},function(err){
// 		console.log("getAllChannelsInfo:");
// 		console.log(err);
// 		if(err == "undefined"){
// 			return AllChanInfo;
// 		}else{
// 			AllChanInfo.push(err);
// 		}
// 	});
// }

function buildTarget(peer, org) {
    var target = null;
    if (typeof peer !== 'undefined') {
        let targets = helper.newPeers([peer], org);
        if (targets && targets.length > 0) target = targets[0];
    }
    return target;
}

var getChainCodeNum = function (channelname, peer, type, username, org) {
    var target = buildTarget(peer, org);
    var channel = helper.getChannelForOrg(channelname, org);
    if (channel == null) {
        logger.error('===============channle is null======================== ');
        return;
    }
    var client = helper.getClientForOrg(org);

    return helper.getOrgAdmin(org).then((member) => {
        if (type === 'installed') {
            return client.queryInstalledChaincodes(target);
        } else {
            return channel.queryInstantiatedChaincodes(target);
        }
    }, (err) => {
        logger.info('Failed to get submitter "' + username + '"');
        return 'Failed to get submitter "' + username + '". Error: ' + err.stack ?
            err.stack : err;
    }).then((response) => {
        if (response) {
            if (type === 'installed') {
                logger.debug('<<< Installed Chaincodes >>>');
            } else {
                logger.debug('<<< Instantiated Chaincodes >>>');
            }
            var details = [];
            for (let i = 0; i < response.chaincodes.length; i++) {
                logger.debug('name: ' + response.chaincodes[i].name + ', version: ' +
                    response.chaincodes[i].version + ', path: ' + response.chaincodes[i].path
                );
                details.push('name: ' + response.chaincodes[i].name + ', version: ' +
                    response.chaincodes[i].version + ', path: ' + response.chaincodes[i].path
                );
            }
            return details;
        } else {
            logger.error('response is null');
            return 'response is null';
        }
    }, (err) => {
        logger.error('Failed to send query due to error: ' + err.stack ? err.stack :
            err);
        return 'Failed to send query due to error: ' + err.stack ? err.stack : err;
    }).catch((err) => {
        logger.error('Failed to query with error:' + err.stack ? err.stack : err);
        return 'Failed to query with error:' + err.stack ? err.stack : err;
    });
};


exports.queryChaincode = queryChaincode;
exports.getBlockByNumber = getBlockByNumber;
exports.getTransactionByID = getTransactionByID;
exports.getBlockByHash = getBlockByHash;
exports.getChainInfo = getChainInfo;
exports.getInstalledChaincodes = getInstalledChaincodes;
exports.getChannels = getChannels;
exports.getChainCodeNum = getChainCodeNum;
