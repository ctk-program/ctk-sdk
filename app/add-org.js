'use strict';
let log4js = require('log4js');
let logger = log4js.getLogger('new-org');
let fs = require('fs-extra');
//let superagent = require('superagent');
let agent = require('superagent-promise')(require('superagent'), Promise);
let requester = require('request');

let helper = require('./helper.js');
let path = require('path');
let addNewOrg = async function(domain, channel_name, fcn, projectID) {
    let orgs = helper.ORGS;
    let cur_orgs = [];
    let orgname = domain.split('.')[0];
    for (let key in orgs) {
        if (orgname === key && fcn === 'add') {
            return null;
        }
        if (key !== 'orderer' && key !== 'order0')
            cur_orgs.push(key);
    }
    let cur_org = cur_orgs[0];
    let cur_MSP = cur_org;
    let new_MSP = orgname;
    let client = helper.getClientForOrg(cur_org);
    let channel = helper.getChannelForOrg(channel_name,cur_org);
    let admins = path.join('/var/certification/'+ projectID + '/crypto-config/peerOrganizations/' +domain +'/msp/admincerts/' + 'Admin@' + domain + '-cert.pem');
    let root_certs = path.join( '/var/certification/'+ projectID +'/crypto-config/peerOrganizations/' +domain +'/msp/cacerts/' + 'ca.' + domain + '-cert.pem');
    let tls_root_certs = path.join('/var/certification/'+ projectID +'/crypto-config/peerOrganizations/' +domain +'/msp/tlscacerts/' +'tlsca.' + domain + '-cert.pem');
    try {

        await helper.getOrgAdmin(cur_org);
        // get the latest config block of the channel: map
        let config_envelope = await channel.getChannelConfig();

        // original "config" object: protobuf
        let original_config_proto = config_envelope.config.toBuffer();
        // use tool : configtxlator : pb->json
        let response = await new Promise((resolve, reject) => {
            requester.post({
                url: 'http://127.0.0.1:7059/protolator/decode/common.Config',
                // if dont have 'encoding' and 'headers', it will: error authorizing update
                encoding: null,
                headers: {
                    accept: '/',
                    expect: '100-continue'
                },
                body: original_config_proto
            }, (err, res, body) => {
                if (err) {
                    logger.error('Failed to get the updated configuration ::' + err);
                    reject(err);
                } else {
                    const proto = Buffer.from(body, 'binary');
                    resolve(proto);
                }
            });
        });
        // original config: json
        let original_config_json = response.toString();
        let updated_config_json = original_config_json;
        // Json string -> Json object
        // let updated_config = JSON.parse(updated_config_json);
        let updated_config = JSON.parse(updated_config_json);

        // modify the config -- add new org

        if (fcn === 'add') {
            // deep copy
            let new_config = JSON.stringify(updated_config.channel_group.groups.Application.groups[cur_MSP]);
            console.log(cur_MSP,new_config);
            new_config = JSON.parse(new_config);
            new_config.policies.Admins.policy.value.identities[0].principal.msp_identifier = new_MSP;
            new_config.policies.Readers.policy.value.identities[0].principal.msp_identifier = new_MSP;
            new_config.policies.Writers.policy.value.identities[0].principal.msp_identifier = new_MSP;
            new_config.values.MSP.value.config.name = new_MSP;

            let f1 = fs.readFileSync(admins);
            let f2 = fs.readFileSync(root_certs);
            let f3 = fs.readFileSync(tls_root_certs);

            f1 = new Buffer(f1).toString('base64');
            f2 = new Buffer(f2).toString('base64');
            f3 = new Buffer(f3).toString('base64');

            new_config.values.MSP.value.config.admins[0] = f1;
            new_config.values.MSP.value.config.root_certs[0] = f2;
            new_config.values.MSP.value.config.tls_root_certs[0] = f3;

            updated_config.channel_group.groups.Application.groups[new_MSP] = new_config;
        }
        else if (fcn === 'delete'){
            let del_org = domain ;
            let res = delete updated_config.channel_group.groups.Application.groups[del_org]
        }
        //console.log(JSON.stringify(updated_config))
        updated_config_json = JSON.stringify(updated_config);

        // configtxlator: json -> pb

        // response = await agent.post('http://127.0.0.1:7059/protolator/encode/common.Config',
        //     updated_config_json.toString()).buffer();
        response = await new Promise((resolve, reject) => {
            requester.post({
                url: 'http://192.168.0.243:7059/protolator/encode/common.Config',
                // if dont have 'encoding' and 'headers', it will: error authorizing update
                encoding: null,
                headers: {
                    accept: '/',
                    expect: '100-continue'
                },
                body: updated_config_json.toString()
            }, (err, res, body) => {
                if (err) {
                    logger.error('Failed to get the updated configuration ::' + err);
                    reject(err);
                } else {
                    const proto = Buffer.from(body, 'binary');
                    resolve(proto);
                }
            });
        });
        let updated_config_proto = response;
        console.log(updated_config_proto);
        let formData = {
            channel: channel_name,
            original: {
                value: original_config_proto,
                options: {
                    filename: 'original.proto',
                    contentType: 'application/octet-stream'
                }
            },
            updated: {
                value: updated_config_proto,
                options: {
                    filename: 'updated.proto',
                    contentType: 'application/octet-stream'
                }
            }
        };

        // configtxlator: computer
        // need request v1.9.8   (2.87.0  err)
        response = await new Promise((resolve, reject) => {
            requester.post({
                url: 'http://127.0.0.1:7059/configtxlator/compute/update-from-configs',
                // if dont have 'encoding' and 'headers', it will: error authorizing update
                encoding: null,
                headers: {
                    accept: '/',
                    expect: '100-continue'
                },
                formData: formData
            }, (err, res, body) => {
                if (err) {
                    logger.error('Failed to get the updated configuration ::' + err);
                    reject(err);
                } else {
                    const proto = Buffer.from(body, 'binary');
                    resolve(proto);
                }
            });
        });

        logger.debug('Successfully had configtxlator compute the updated config object');
        let config_proto = response;

        let signatures = []
        //client._userContext = null;

        for (let org of cur_orgs) {
            // assign the admin userobj to client
            client = helper.getClientForOrg(org);
            console.log(org);
            let r = await helper.getOrgAdmin(org);
            //console.log(r)
            //console.log(client)

            let signature = client.signChannelConfig(config_proto);
            signatures.push(signature)
        }
        logger.debug('Successfully signed config update by orgs');

        let tx_id = client.newTransactionID();
        let request = {
            config: config_proto,
            signatures: signatures,
            name: channel_name,
            orderer: channel.getOrderers()[0],
            txId: tx_id
        };
        let result = await client.updateChannel(request);
        if(result.status && result.status === 'SUCCESS') {
            logger.debug('Successfully updated the channel.');
        } else {

            logger.error('Failed to update the channel.',result);
        }
    }
    catch(err) {
        logger.error('Failed to update the channel: ' + err.stack ? err.stack : err);
    }

};
exports.AddNewOrg = addNewOrg;
// addNewOrg("org3.example.com", "testchannel", "add");
