// console.log("process.env.NODE_ENV: '" + process.env.NODE_ENV + "'");
let nodeEnvExtraSpaceWorkAround; // for some reason, 'process.env.NODE_ENV' adds an extra space to result in 'development ', so I added this work around. I also added production workaround, just in case
if(process.env.NODE_ENV === "development ")  nodeEnvExtraSpaceWorkAround = "development"
else if( process.env.NODE_ENV === "production ")  nodeEnvExtraSpaceWorkAround = "production";
// console.log("nodeEnvExtraSpaceWorkAround: '" + nodeEnvExtraSpaceWorkAround + "'");

const wasDBCollectionFound = require('dotenv').config({ path: `.env.${nodeEnvExtraSpaceWorkAround}` });
// console.log("wasDBCollectionFound:", wasDBCollectionFound);
import { Socket } from 'socket.io';
const server = require('express')();

const http = require('http').createServer(server);

const io = require('socket.io')(http, {
	cors: {
		origin: "*",
		methods: ["GET", "POST"]
	}
});

const serviceAccount = require('./service-account.json');
const admin = require('firebase-admin');
admin.initializeApp({
	credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

interface ScoreSubmission {
	tokenId: string,
	score: number,
	name: string
}

const submitScore = async ({ tokenId, score, name }: ScoreSubmission) => {
	const collection = db.collection(process.env.DB_COLLECTION);
 	const ref = collection.doc(tokenId);
	const doc = await ref.get().catch(err => { return { status: 400, error: err } });

	if ('error' in doc) return doc;

	if (!doc.exists || doc.data().score < score) {
		try {
			await ref.set({
				tokenId,
				name,
				score
			});
			return {
				status: 200,
				error: undefined
			}
		} catch (err) {
			return {
				status: 400,
				error: err
			};
		}
	} else {
		return {
			status: 400,
			error: "Score not larger than original"
		}
	}
}

const port = process.env.PORT || 8080;

const connectedGotchis = {};

io.on('connection', function (socket: Socket) {
	const userId = socket.id;
	let timeStarted: Date;

	console.log('A user connected: ' + userId);
	connectedGotchis[userId] = { id: userId };
	console.log(connectedGotchis);

	socket.on('handleDisconnect', () => {
		socket.disconnect();
	})

	socket.on('setGotchiData', (gotchi) => {
		connectedGotchis[userId].gotchi = gotchi;
	})

	socket.on('disconnect', function () {
		console.log('A user disconnected: ' + userId);
		delete connectedGotchis[userId];
	});

	socket.on('gameStarted', () => {
		console.log('Game started: ', userId);
		timeStarted = new Date();
	})

	socket.on('gameOver', async ({ score }: { score: number }) => {
		console.log('Game over: ', userId);
		console.log('Score: ', score);

		const highscoreData = {
			score,
			name: connectedGotchis[userId].gotchi.name,
			tokenId: connectedGotchis[userId].gotchi.tokenId,
		}
		console.log("Submit score: ", highscoreData);

		try {
			const res = await submitScore(highscoreData);
			if (res.status !== 200) throw res.error;
			console.log("Successfully updated database");
		} catch (err) {
			console.log(err);
		}
	})
});

http.listen(port, function () {
	console.log(`Listening on - PORT:${port}`);
});

