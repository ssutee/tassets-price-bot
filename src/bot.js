require("dotenv").config();

const bluebird = require("bluebird");
const redis = require("redis");
bluebird.promisifyAll(redis.RedisClient.prototype);
const client = redis.createClient();

const { fromWei } = require("web3-utils");

const dayjs = require("dayjs");
dayjs.locale("th");

const TelegramBot = require("node-telegram-bot-api");
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/(eur|jpy|xau)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const collateralRatio = await client.getAsync("collateral-ratio");
  const growthRatio = await client.getAsync("growth-ratio");
  const resp = match[1];
  const totalSupply = await client.getAsync(resp + "-total-supply");
  const swapPrice = await client.getAsync(resp + "-swap-price");
  const oraclePrice = await client.getAsync(resp + "-oracle-price");
  const marketCap = await client.getAsync(resp + "-market-cap");
  const diffPercent = await client.getAsync(resp + "-diff-percent");
  const timestamp = await client.getAsync("timestamp");
  const date = new Date();
  date.setTime(parseInt(timestamp) * 1000);
  const day = dayjs(date);
  const text = `
asset: t${resp.toUpperCase()}

oracle price: $${parseFloat(fromWei(oraclePrice)).toFixed(4)}
swap price: $${parseFloat(fromWei(swapPrice)).toFixed(4)}
diff: ${diffPercent}%

total supply: ${parseFloat(fromWei(totalSupply)).toLocaleString()}
market cap: $${parseFloat(fromWei(marketCap)).toLocaleString()}

collateral ratio: ${(
    parseFloat(fromWei(collateralRatio)) * 100
  ).toLocaleString()}%
growth ratio: ${parseFloat(fromWei(growthRatio)).toLocaleString()}%
  
⏱ ${day.format("DD/MM/YYYY HH:mm:ss")}  
`;
  bot.sendMessage(chatId, text);
});
