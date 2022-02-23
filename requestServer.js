const express = require('express');
const session = require('express-session');

const userManager = require('./userManager');
const { USER_STATE } = userManager;
const lineManager = require('./lineManager');
const gameManager = require('./gameManager');

const app = express();

const port = 3000;
let started = false;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SECRET_SESSION_KEY,
  resave: false,
  saveUninitialized: true
}));

app.use((req, res, next) => {
  if (req.session.isServer) {
    return next();
  }
  if (!req.session.userID) {
    console.log('not existing user');
    const user = userManager.registerUser(req.sessionID);
    req.session.userID = user.getUserID();
    console.log('new user id:', req.session.userID);
  }
  res.locals.user = userManager.getUserByUserID(req.session.userID);
  next()
});

app.get('/', (_req, res) => {
  res.status(200).json({message: 'bug'});
});

app.all('/server/*', (req, res, next) => {
  res.locals.gameState = gameManager.getState();
  // checks that only the server is making valid requests to server routes
  if (res.locals.gameState !== gameManager.GAME_STATE.OFFLINE && !req.session.isServer) {
    console.log('2. not authorized');
    console.log(res.locals.gameState);
    return res.status(401).json({error: 'not authorized'});
  }
  next();
});

// when gameState === READY goto menu
// GENERATING_CARD => generate card
// ASSIGNING_PILOT => generate card
// CONNECTING_PLAYER => wait for player connection to game server
app.get('/server/status', (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { gameState } = res.locals;
  const currentPlayer = gameManager.getCurrentPlayer(); // required to assign pilot
  const secretConnectionKey = gameManager.getSecretConnectionKey(); // required to assign pilot
  res.json({ gameState, currentPlayer, secretConnectionKey });
});

app.post('/server/register', (req, res) => {
  const { secret } = req.body;
  if (res.locals.gameState !== gameManager.GAME_STATE.OFFLINE) {
    console.log('401 server already connected');
    return res.status(401).json({error: 'server already connected'});
  }
  if (secret === process.env.SECRET_GAME_KEY) {
    gameManager.registerServer(req.sessionID);
    req.session.isServer = true;
    return res.json({connected: true});
  }
  res.status(401).json({error: 'bad key'});
});

app.post('/server/card', (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { filename } = req.body;
  // call in someway the onMessageConfirmation from step 3 in gameManager.gameOver 
  gameManager.onMessageConfirmation('gs_cardGenerated', filename);
  res.status(200).json({});
});

app.post('/server/player/connected', (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { success, secret, godotPeerID } = req.body;
  if (success) {
    gameManager.registerPlayerConnection(secret, godotPeerID);
  } else {
    // handle failed connection ?
  }
  res.status(200).json({});
});

app.post('/server/player/disconnected', (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { godotPeerID } = req.body;
  gameManager.handlePlayerDisconnection(godotPeerID);
  res.status(200).json({});
});

app.post('/server/player/game-over', async (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { godotPeerID, causeOfDeath } = req.body;
  await gameManager.gameOver(godotPeerID, causeOfDeath);
  res.status(200).json({});
});

app.post('/server/player/score', async (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { godotPeerID, score } = req.body;
  const user = userManager.getUserByGodotPeerID(godotPeerID);
  await gameManager.rewardPoints(user, parseInt(score));
  res.status(200).json({});
});

app.post('/server/player/reward', async (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  const { godotPeerID, rewardID } = req.body;
  const user = userManager.getUserByGodotPeerID(godotPeerID);
  await gameManager.rewardGameToken(user, rewardID);
  res.status(200).json({});
});

app.post('/server/player/ready', (req, res) => {
  if (!req.session.isServer) return res.status(401).json({error: 'not authorized'});
  gameManager.onPilotReady(true);
  res.status(200).json({});
});

app.get('/user', (req, res) => {
  const { user } = res.locals;
  res.json(user.asObject());
});

app.post('/user/request', async (req, res) => {
  const { secret } = req.body;
  if (!req.session.userID) return;
  const { user } = res.locals;
  req.session.userID = await user.allocateOnBlockchain(secret);
  res.json({ userID: req.session.userID });
});

app.post('/user/recover', async (req, res) => {
  console.log('request: /user/recover');
  console.log(req.body);
  const { userID, secret } = req.body;
  // validate this user is already recovered?
  console.log(res.locals);
  const { user } = res.locals;
  const recovered = await user.recoverSession(userID, secret);
  if (recovered) {
    req.session.userID = userID;
  } else {
    return res.status(401).json({ recovered });
  }
  res.status(200).send({ recovered });
})

app.post('/user/request-turn', async (req, res) => {
  const { user } = res.locals;
  await lineManager.requestTurnFor(user);
  const turn = user.getTurn();
  res.json({ turn });
});

app.post('/user/bug', (req, res) => {
  const { adn, name } = req.body;
  const { user } = res.locals;
  user.setBug(adn, name);
  res.status(200).json({});
});

app.post('/user/bug/intro', (req, res) => {
  const { intro } = req.body;
  const { user } = res.locals;
  user.setIntroWords(intro);
  res.status(200).json({});
});

app.post('/user/bug/last', (req, res) => {
  const { last } = req.body;
  const { user } = res.locals;
  user.setLastWords(last);
  res.status(200).json({});
});


app.get('/user/sync-state', (req, res) => {
  const { user } = res.locals;
  const response = {
    canConnect: user.getState() === USER_STATE.WAITING_FOR_CONNECTION,
    user: user.asObject()
  };
  if (response.canConnect) {
    response.secretKey = user.getSecretKey();
  }
  res.json(response);
});

app.post('/user/near-credentials', async (req, res) => {
  const { accountId, secret } = req.body;
  const { user } = res.locals;
  const assigned = await user.setNearAccount(accountId, secret);
  res.status(200).json({assigned});
});

const startServer = () => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Example app listening on port ${ port }!`)
    started = true;
  });
};

module.exports = {
  startServer,
  isStarted: () => started
}
