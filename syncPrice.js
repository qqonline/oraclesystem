const http = require('http');
const url = require('url');

const oraclePrice = require('./src/database/oraclePrice');
const apiPriceConfig = require('./src/utils/config/apiPriceConfig');
const {
	asyncGet
} = require('./src/helpers/request');

const {
    getMedian
} = require('./src/helpers/getPrice');

const {
	supportAssets,
	localPort
} = require('./src/utils/config/base.config');


const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

var duration = 30000;
var priceData = {};
var medianData = {};
var endflag = 0;
var time;

async function parsePriceData(priceData, currency, timestamp) {

	var data = [];
	var result;
	var price = '0';
	var endSign = false;
	console.log(`parsePriceData : ${currency} ; timestamp : ${timestamp}----------------------------\n`);
	for (let index = 0; index < priceData.length; index++) {
		price = '0';
		endSign = false;
		console.log(`exchange: ${priceData[index].sign}, ${timestamp}, length: ${data.length}`);
		console.log(`res: ${JSON.stringify(priceData[index])}`);
		console.log(`\n`);
		if (!priceData[index].data)
			continue;
			
		try {
			result = priceData[index].data == String ? JSON.parse(priceData[index].data) : priceData[index].data;
			if (!(result instanceof Object))
				continue;
			switch (priceData[index].sign) {
				case apiPriceConfig.exchange[0]:
					if (result.hasOwnProperty('price') && result.price && !isNaN(result.price)) {
						price = result.price.toString();
						endSign = true;
					}
					break;
				case apiPriceConfig.exchange[1]:
					if (result.hasOwnProperty('last') && result.last && !isNaN(result.last)) {
						price = result.last.toString();
						endSign = true;
					}
					break;
				case apiPriceConfig.exchange[2]:
					if (result.hasOwnProperty('tick') 
						&& result.tick instanceof Object
						&& result.tick.hasOwnProperty('bid')
						&& Array.isArray(result.tick.bid)
						&& result.tick.bid[0]
						&& !isNaN(result.tick.bid[0])
					) {
						price = result.tick.bid[0].toString();
						endSign = true;
					}
					break;
				case apiPriceConfig.exchange[3]:
					if (result.hasOwnProperty('last') && result.last && !isNaN(result.last)) {
						price = result.last.toString();
						endSign = true;
					}
					break;
				case apiPriceConfig.exchange[4]:
					if (Array.isArray(result) 
						&& Array.isArray(result[0])
						&& result[0].length > 7
						&& result[0][7]
						&& !isNaN(result[0][7])
					) {
						price = result[0][7].toString();
						endSign = true;
					}
					break;
				case apiPriceConfig.exchange[5]:
					if (result.hasOwnProperty('result') 
						&& result.result instanceof Object
						&& result.result.hasOwnProperty('Last')
						&& result.result.Last
						&& !isNaN(result.result.Last)
					) {
						price = result.result.Last.toString();
						endSign = true;
					}
					break;
				case apiPriceConfig.exchange[6]:
					if (result.hasOwnProperty('data') 
						&& result.data instanceof Object
						&& result.data.hasOwnProperty('price')
						&& result.data.price
						&& !isNaN(result.data.price)
					) {
						price = result.data.price.toString();
						endSign = true;
					}
					break;
				default:
					break;
			}
		} catch (error) {
			console.log(error);
		}
		
		if(endSign)
			data.push([priceData[index].sign, currency, price.toString(), endSign, timestamp]);		
	}
	console.log(`currency: ${currency}, ${timestamp}, length: ${data.length}`);
	console.log(data);
	if (data.length < 5) {
		return data;
	}
	oraclePrice.insertExchangePrice(data);
	await delay(200);
	oraclePrice.cleanDatabase(500);

	return data;
}

async function main() {

	oraclePrice.initDB();
	await delay(200);
	while (true) {

		console.log('start----------------------------\n');
		time = Math.ceil(Date.now() / 1000);
		for (let i = 0; i < supportAssets.length; i++) {

			priceData[supportAssets[i]] = [];
			for (let index = 0; index < apiPriceConfig.apiList[supportAssets[i]].length; index++) {
				asyncGet(apiPriceConfig.apiList[supportAssets[i]][index], duration, priceData[supportAssets[i]], apiPriceConfig.exchange[index]);
				console.log(`sync ${supportAssets[i]} price [${index}]:${apiPriceConfig.exchange[index]}  url: ${apiPriceConfig.apiList[supportAssets[i]][index]}`);
			}
		}

		while(endflag < supportAssets.length){

			for (let index = 0; index < supportAssets.length; index++) {
				if (priceData[supportAssets[index]].length == apiPriceConfig.exchange.length) {
					medianData[supportAssets[index]] = await parsePriceData(priceData[supportAssets[index]], supportAssets[index], time);
					priceData[supportAssets[index]] = [];
					endflag += 1;
				}
			}
			await delay(200);
		}

		endflag = 0;
		
		var data = [];
		var priceMedian;
		for (let index = 0; index < supportAssets.length; index++) {
			priceMedian = getMedian(medianData[supportAssets[index]]);

			console.log(supportAssets[index]);
			console.log(priceMedian.result);
			console.log(priceMedian.median.toString());
			if (priceMedian.result)
				data.push([priceMedian.exchange, supportAssets[index], priceMedian.median.toString(), time]);
			
		}
		console.log(data);
		if (data.length)	
			oraclePrice.insertFeedPrice(data);
		
		console.log('medianData----------------------------\n');
		console.log(medianData);
		console.log('end----------------------------\n\n');
		await delay(50000);
	}
}

main();

http.createServer(async function(req, res){
	
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    var urlInfo = url.parse(req.url, true);
    var result = 'parameter error';
	console.log(urlInfo);
	var data = '';
	for (const key in urlInfo.query) {
		switch (key) {
			case 'model':
				switch (urlInfo.query[key]) {
					case 'feedPrice':
						if (urlInfo.query.currency){
							result = await oraclePrice.getFeedPrice(urlInfo.query.currency);
							if (result[0].id == null)
								result = [{}];
							result = JSON.stringify(result);
							res.end(`${data}`);		
						}
						break;
					case 'lendfMePrice':
						if (urlInfo.query.asset){
							result = await oraclePrice.getLendfMePrice(urlInfo.query.asset);
							if (result[0].id == null)
								result = [{}];
							result = JSON.stringify(result);
							res.end(`${data}`);		
						}
						break;
					case 'insertLendfMePrice':
						req.on('data', async function(chunk){    
							data += chunk;
							console.log(data);
							oraclePrice.insertLendfMePrice(JSON.parse(data));
							if (result[0].id == null)
								result = [{}];
							result = JSON.stringify(result);
							res.end(`${data}`);
						});
						break;
					default:
						break;
				}
				break;
			default:
				break;
		}
		break;
	}
}).listen(localPort);
