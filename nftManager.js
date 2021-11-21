require('dotenv').config();
const fs = require('fs');
const { NFTStorage, File } = require('nft.storage');
const log = require('./log');

const client = new NFTStorage({ token: process.env.NFT_STORAGE_KEY });

const test = async () => {
  const metadata = await client.store({
    name: 'The Big Adventure Show Icon',
    description: 'The Big Adventure Show first Icon iteration - test',
    image: new File(
      [
        await fs.promises.readFile('./bugAdventureShow.png')
      ],
      'bugAdventureShow.png',
      { type: 'image/png' }
    ),
    properties: {
      turn: 67,
      causeOfDeath: 'timeout',
      video: 'vv656898990',
      name: 'mono'
    }
  })
  log.info(metadata.ipnft);
  log.info(metadata.embed());

}


test();
