const fs = require('fs');
const jimp = require('jimp');
const { NFTStorage, File } = require('nft.storage');
const log = require('./log');

const client = new NFTStorage({ token: process.env.NFT_STORAGE_KEY });


const generateMedia = (file) => {
  const fullPath = `${ process.env.NFT_MEDIA_PATH }/${ file }`;
  const sides = [fullPath.replace('.png', 'A.png'), fullPath.replace('.png', 'B.png')];
  const img = jimp.read(fullPath);
  await img.clone()
     .crop(0,20,320,320)
     .writeAsync(sides[0]);
  await img.crop(320,20,320,320)
     .writeAsync(sides[1]);
  return sides;
};

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

const generateNFT = async (user, imageFile, videoId) => {
  const [sideA, sideB] = generateMedia(imageFile);
  const metadata = await client.store({
    name: `The Big Adventure Show (Pilot) - Participant #${ user.getTurn() } Record Card`,
    description: `Big Adventure Show Souvenir Card for Participant #${ user.getTurn() } - Pilot`,
    image: new File([await fs.promises.readFile(sideA)],
      `BAS_Pilot_${ user.getTurn() }A.png`,
      { type: 'image/png' }
    ),
    properties: {
      adn: user.getAdn(),
      turn: user.getTurn(),
      causeOfDeath: user.getCauseOfDeath(),
      video: `https://media.thetavideoapi.com/${ videoId }`,
      name: user.getName(),
      lastWords: user.getLastWords(),
      introWords: user.getIntroWords(),
      sideB: new File([await fs.promises.readFile(sideB)],
        `BAS_Pilot_${ user.getTurn() }B.png`,
        { type: 'image/png' }
      ),
    }
  });
  return metadata.ipnft;
};

module.exports = {
  generateNFT
}