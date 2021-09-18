require("dotenv").config();

const redis = require("redis");
const client = redis.createClient();

const { toWei } = require("web3-utils");
const { default: BigNumber } = require("bignumber.js");

const {
  SENDER_PRIVATE_KEY,
  EUR_ADDRESS,
  JPY_ADDRESS,
  XAU_ADDRESS,
  KUSD_ADDRESS,
  EUR_LP_ADDRESS,
  JPY_LP_ADDRESS,
  XAU_LP_ADDRESS,
  CONTROLLER_ADDRESS,
  RESERVE_ADDRESS,
  BSC_RPC,
} = process.env;

const Web3 = require("web3");
const web3 = new Web3(BSC_RPC);

web3.eth.accounts.wallet.add(SENDER_PRIVATE_KEY);
const sender = web3.eth.accounts.wallet[0];

const { abi: kusdABI } = require("./KUSD.json");
const kusd = new web3.eth.Contract(kusdABI, KUSD_ADDRESS);

const { abi: controllerABI } = require("./Controller.json");
const controller = new web3.eth.Contract(controllerABI, CONTROLLER_ADDRESS);

const { abi: reserveABI } = require("./Reserve.json");
const reserve = new web3.eth.Contract(reserveABI, RESERVE_ADDRESS);

const { abi: synthABI } = require("./Synth.json");
const synths = {
  eur: new web3.eth.Contract(synthABI, EUR_ADDRESS),
  jpy: new web3.eth.Contract(synthABI, JPY_ADDRESS),
  xau: new web3.eth.Contract(synthABI, XAU_ADDRESS),
};

const { abi: pairABI } = require("./Pair.json");
const pairs = {
  eur: new web3.eth.Contract(pairABI, EUR_LP_ADDRESS),
  jpy: new web3.eth.Contract(pairABI, JPY_LP_ADDRESS),
  xau: new web3.eth.Contract(pairABI, XAU_LP_ADDRESS),
};

const getKUSDPrice = async () => {
  const price = await kusd.methods.getSynthPrice().call({
    from: sender.address,
  });
  return price.toString();
};

const getPrice = async (name) => {
  const price = await synths[name].methods.getSynthPrice().call({
    from: sender.address,
  });
  return price.toString();
};

const getSwapPrice = async (name) => {
  const result = await pairs[name].methods
    .getReserves()
    .call({ from: sender.address });
  const r0 = result._reserve0;
  const r1 = result._reserve1;
  const token0 = await pairs[name].methods
    .token0()
    .call({ from: sender.address });
  let price =
    token0 == KUSD_ADDRESS
      ? BigNumber(toWei("1")).times(BigNumber(r0)).idiv(BigNumber(r1))
      : BigNumber(toWei("1")).times(BigNumber(r1)).idiv(BigNumber(r0));

  const kusdPrice = await kusd.methods.getSynthPrice().call({
    from: sender.address,
  });
  price = price
    .times(BigNumber(kusdPrice.toString()))
    .idiv(BigNumber(toWei("1")));
  return price.toFixed();
};

const getTotalSupply = async (name) => {
  const totalSupply = await synths[name].methods.totalSupply().call({
    from: sender.address,
  });
  return totalSupply.toString();
};

const getCollateralRatio = async () => {
  const collateralRatio = await reserve.methods.globalCollateralRatio().call({
    from: sender.address,
  });
  return collateralRatio.toString();
};

const getGrowthRatio = async () => {
  const growthRatio = await controller.methods.growthRatio().call({
    from: sender.address,
  });
  return growthRatio.toString();
};

const restart = async () => {
  await wait(60000);
  main()
    .then(() => restart().catch(() => {}))
    .catch((error) => {
      console.error(error);
      restart().catch(() => {});
    });
};

const wait = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const main = async () => {
  const block = await web3.eth.getBlock("latest");
  client.set("timestamp", block.timestamp, redis.print);
  for (var synth in synths) {
    const totalSupply = await getTotalSupply(synth);
    const swapPrice = await getSwapPrice(synth);
    const oraclePrice = await getPrice(synth);
    const diffPercent = BigNumber(swapPrice)
      .div(BigNumber(oraclePrice))
      .minus(1)
      .times(100)
      .toFixed(2);
    const marketCap = BigNumber(totalSupply)
      .times(BigNumber(swapPrice))
      .idiv(BigNumber(toWei("1")))
      .toFixed();
    client.set(synth + "-total-supply", totalSupply);
    client.set(synth + "-oracle-price", oraclePrice);
    client.set(synth + "-swap-price", swapPrice);
    client.set(synth + "-market-cap", marketCap);
    client.set(synth + "-diff-percent", diffPercent);
  }
  client.set("tassets-collateral-ratio", await getCollateralRatio());
  client.set("tassets-growth-ratio", await getGrowthRatio());
};

main()
  .then(() => restart().catch(() => {}))
  .catch((error) => {
    console.error(error);
    restart().catch(() => {});
  });
