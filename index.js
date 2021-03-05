const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const ethers = require('ethers');
const abi = require('patient-consent-contract/artifacts/contracts/PatientConsent.sol/PatientConsent.json');

const app = express();

const PORT = process.env.PORT || 8080;
let MONGO_URL;
if(process.env.MONGO_URL){
    MONGO_URL = process.env.MONGO_URL;
} else {
    throw new Error("Define MONGO_URL environment variable");
}

let provider;
if(process.env.INFURA_API_KEY && process.env.INFURA_NET) {
    provider = new ethers.providers.InfuraProvider(process.env.INFURA_NET, process.env.INFURA_API_KEY);
} else {
    throw new Error("Define INFURA_API_KEY and INFURA_NET environment variables");
}

let contract;
if(process.env.CONTRACT_ADDRESS && process.env.MNEMONIC) {
    signer = ethers.Wallet.fromMnemonic(process.env.MNEMONIC).connect(provider);
    contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, abi.abi, signer);
} else {
    throw new Error("Define CONTRACT_ADDRESS and MNEMOTIC environment variables");
}

app.use(express.json());
app.use(cors());

const PatientSchema = new mongoose.Schema({
    "password": String,
    "first_name": String,
    "last_name": String,
    "email": String,
    "gender": String,
    "diagnose": String,
    "birthdate": Date,
    "therapist": String,
    "addiction": String
});

var NameModel = mongoose.model("patients", PatientSchema);

app.get("/client", async function(req,res){
    const {requester, client} = req.query;
    const id = await contract.getClientId(client ?? ethers.constants.AddressZero);
    if(id !== 0) {
        NameModel.findOne(
            {id: id}
        )
            .exec()
            .then(async (data) => {
                let response = Object.assign({}, data._doc);
                const request = await contract.getClientPermission(
                    requester, client, {gasLimit: 100000}
                ).then(response => response.wait());
                const permission = request.events[0].args.permission;
                if(!permission) {
                    response['addiction'] = "";
                    response['permission'] = false;
                } else {
                    response['permission'] = true;
                }
                res.json(response);
            })
            .catch(err => {
                res.status(500).json({message: err.message});
            });
    } else {
        res.status(500).json({message: "This address is not registered yet"});
    }
});

app.get("/doctor/:dname", function(req,res){
    NameModel.find(
        {therapist:req.params.dname}
    )
        .exec()
        .then(async (data) => {
            data = await Promise.all(data.map(async value => {
                let response = Object.assign({}, value._doc);
                const client = await contract.getClientAddress(response.id)
                    .catch(err => ethers.constants.AddressZero);
                if(client !== ethers.constants.AddressZero) {
                    response['registered'] = true;
                    const response = await contract.getClientPermission(
                        req.body.requester, client
                    ).then(response => response.wait());
                    const permission = response.events[0].args.permission;
                    if(!permission) {
                        response['addiction'] = "";
                        response['permission'] = false;
                    } else {
                        response['permission'] = true;
                    }
                } else {
                    response['registered'] = false;
                    response['permission'] = true;
                }
                return response;
            }));
            res.json(data);
        })
        .catch(err => {
            res.status(500).json({message: err.message});
        });
});

mongoose.connect(process.env.MONGO_URL, {useNewUrlParser: true})
    .then(() => {
        app.listen(PORT, () => {
            console.log(`API listens on ${PORT}`);
        });
    });
