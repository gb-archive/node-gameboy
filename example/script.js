'use strict';

const fs = require('fs');
const cart = fs.readFileSync('./roms/opus5.gb');
const bios = fs.readFileSync('./support/bios.bin');
const Gameboy = require('../');

const gameboy = new Gameboy({ bios });
gameboy.loadCart(cart);
gameboy.powerOn();

let i = 0;
gameboy.gpu.on('frame', (canvas) => {
    if (++i % 60) return;
    fs.writeFile(`./screenshot/${i / 60}.png`, canvas.toBuffer());
});
