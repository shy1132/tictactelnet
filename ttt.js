const net = require('net')
const fs = require('fs')

let port = 11329

let asciiArt = fs.readFileSync('./art.txt', 'utf-8')
let shortWords = fs.readFileSync('./shortWords.txt', 'utf-8').split('\n')

let ansi = {
    clearScreen: '\x1B[2J\x1B[3J\x1B[H',
    clearFormatting: '\x1b[0m',
    bold: '\x1B[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m'
}

let rooms = {}

let server = net.createServer(async (socket) => {
    socket.write(ansi.clearScreen)
    socket.write(asciiArt)
    socket.write('\r\nshy 2024\r\n\r\n')
    socket.write('type 1 to join a room\r\ntype 2 to create a room\r\n> ')

    socket.once('data', async (data) => {
        let string = (data.toString())?.trim()
        if (string != '1' && string != '2') {
            socket.write('invalid answer, goodbye!\r\n')
            socket.end()
            return;
        }

        if (string == '2') {
            return await handleRoom(socket);
        } else if (string == '1') {
            return await askForRoomCode(socket);
        }
    })
})

async function handleRoom(socket) {
    socket.write(ansi.clearScreen)

    let word = shortWords[Math.floor(Math.random() * shortWords.length)]
    let randomNumber = Math.floor(Math.random() * 10)
    let code = `${word}${randomNumber}`

    if (rooms.hasOwnProperty(code)) {
        socket.write('you just got a 1 in 54,590 chance (probably more) of your room code colliding with another active room\r\n')
        socket.write('i am not writing code to fix this edgecase\r\n')
        socket.write('you just wasted all of your lifes luck on tictactelnet\r\n')
        socket.write('goodbye\r\n')
        return socket.end();
    }

    rooms[code] = {
        code,
        board: '---------',
        turn: 'x',
        verdict: null,
        started: false,
        start: null,
        socket1: socket,
        socket2: null
    }

    socket.write(`your room code is: ${ansi.bold}${code}${ansi.clearFormatting}\r\n`)
    socket.write('share this with the person you want to play with\r\n')
    socket.write('waiting for opponent...')

    rooms[code].start = (socket2) => {
        rooms[code].started = true;
        rooms[code].socket2 = socket2;
        handleTurn(rooms[code])
    }

    setTimeout(() => { //timeout after 2 minutes if nobody joined
        if (rooms[code] && !rooms[code].started) {
            socket.write(ansi.clearScreen)
            socket.write('wow nobody joined your room in 2.5 minutes loser...\r\n')
            socket.write('goodbye!\r\n')
            socket.end()
    
            delete rooms[code];
        }
    }, 150000)
}

async function askForRoomCode(socket) {
    socket.write(ansi.clearScreen)

    socket.write('enter the room code\r\n')
    socket.write('> ')

    socket.once('data', async (data) => {
        let string = (data.toString())?.trim()
        if (!string) {
            socket.write('invalid room code, goodbye!\r\n')
            socket.end()
            return;
        }

        if (!rooms.hasOwnProperty(string)) {
            socket.write('room does not exist, goodbye!\r\n')
            socket.end()
            return;
        }

        if (rooms[string].started) {
            socket.write('that room is already started, goodbye!\r\n')
            socket.end()
            return;
        }

        rooms[string].start(socket)
    })
}

async function handleTurn(room) {
    let socket1 = room.socket1
    let socket2 = room.socket2

    socket1.write(ansi.clearScreen)
    socket2.write(ansi.clearScreen)

    let formattedBoard = formatBoard(room.board)

    let turnSocket = room.turn == 'x' ? socket1 : socket2;
    let otherSocket = room.turn == 'x' ? socket2 : socket1;
    let nextTurn = room.turn == 'x' ? 'o' : 'x'

    turnSocket.write('it is your turn\r\n')
    turnSocket.write(`you are ${ansi.bold}${room.turn}${ansi.clearFormatting}\r\n\r\n`)
    turnSocket.write(formattedBoard)
    turnSocket.write(`\r\n\r\nmake your move (enter the number or row+number of your ${ansi.bold}${room.turn}${ansi.clearFormatting})\r\n`)
    turnSocket.write('> ')

    otherSocket.write('it is their turn\r\n')
    otherSocket.write(`you are ${ansi.bold}${nextTurn}${ansi.clearFormatting}\r\n\r\n`)
    otherSocket.write(formattedBoard)
    otherSocket.write('\r\n\r\nwaiting for opponent...')

    turnSocket.once('data', (data) => {
        let string = (data.toString())?.trim()
        let invalid = false; //setting to true fails it regardless (dumb)

        let number;
        if (string.length === 2) { //row+number
            let lowercaseLetter = string[0].toLowerCase()
            let rowIndex = (lowercaseLetter.charCodeAt(0) - 'a'.charCodeAt(0)); //"a", "b", "c" -> 0, 1, 2
            if (rowIndex < 0 || rowIndex > 2) invalid = true;

            let columnIndex = Number(string[1])
            if (columnIndex < 1 || columnIndex > 3) invalid = true;

            number = (rowIndex * 3) + columnIndex
        } else if (string.length === 1 && !isNaN(string)) {
            number = Number(string)
        }

        let index = number - 1;
        if (invalid || !number || number < 1 || number > 9 || room.board[index] != '-') {
            return handleTurn(room);
        }

        //i just like storing it as a string man
        let boardSplit = room.board.split('')
        boardSplit[index] = room.turn;
        room.board = boardSplit.join('')

        let verdict = checkWin(room.board)
        if (verdict) {
            room.verdict = verdict; //could be x, o, or "tie"
            return handleWin(room);
        }

        room.turn = nextTurn;
        return handleTurn(room);
    })
}

async function handleWin(room) {
    let socket1 = room.socket1
    let socket2 = room.socket2

    socket1.write(ansi.clearScreen)
    socket2.write(ansi.clearScreen)

    let formattedBoard = formatBoard(room.board)

    if (room.verdict == 'tie') {
        socket1.write(`${ansi.yellow}it was a tie!!!!!${ansi.clearFormatting}\r\n\r\n`)
        socket1.write(formattedBoard)
        socket1.write('\r\n\r\ngoodbye!\r\n')

        socket2.write(`${ansi.yellow}it was a tie!!!!!${ansi.clearFormatting}\r\n\r\n`)
        socket2.write(formattedBoard)
        socket2.write('\r\n\r\ngoodbye!\r\n')
    } else {
        let winnerSocket = room.verdict == 'x' ? socket1 : socket2;
        let otherSocket = room.verdict == 'x' ? socket2 : socket1;

        winnerSocket.write(`${ansi.green}you win!!!!!${ansi.clearFormatting}\r\n\r\n`)
        winnerSocket.write(formattedBoard)
        winnerSocket.write('\r\n\r\ngoodbye!\r\n')
    
        otherSocket.write(`${ansi.red}you lose!!!!!${ansi.clearFormatting}\r\n\r\n`)
        otherSocket.write(formattedBoard)
        otherSocket.write('\r\n\r\ngoodbye!\r\n')
    }

    socket1.end()
    socket2.end()

    delete rooms[room.code];
}

function checkWin(string) {
    if (!string.includes('-')) return 'tie';

    let board = []
    let boardRow = 0;
    for (let i = 0; i < 9; i++) {
        let str = string[i]
        if (i % 3 === 0) {
            boardRow = i / 3
            board[boardRow] = []
        }

        board[boardRow].push(str)
    }

    //row
    for (let i = 0; i < 3; i++) {
        if (board[i][0] != '-' && board[i][0] == board[i][1] && board[i][1] == board[i][2]) {
            return board[i][0];
        }
    }

    //column
    for (let j = 0; j < 3; j++) {
        if (board[0][j] != '-' && board[0][j] == board[1][j] && board[1][j] == board[2][j]) {
            return board[0][j];
        }
    }

    //diagonal
    if (board[0][0] != '-' && board[0][0] == board[1][1] && board[1][1] == board[2][2]) {
        return board[0][0];
    }

    if (board[0][2] != '-' && board[0][2] == board[1][1] && board[1][1] == board[2][0]) {
        return board[0][2];
    }

    return null;
}

function formatBoard(board) {
    return `|${board[0]}${board[1]}${board[2]}|\r\n|${board[3]}${board[4]}${board[5]}|\r\n|${board[6]}${board[7]}${board[8]}|`;
}

server.listen(port, () => {
    console.log(`listening on port ${port}`)
})