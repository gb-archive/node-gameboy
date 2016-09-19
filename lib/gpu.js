'use strict';

const debug = require('debug')('gpu');
const draw = require('debug')('gpu:draw');
const pixel = require('debug')('gpu:pixel');
const EventEmitter = require('events').EventEmitter;
const Canvas = require('canvas');

const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 144;

/**
 * FF40 - LCDC - LCD Control (R/W)
 *
 * Bit 7 - LCD Display Enable             (0=Off, 1=On)
 * Bit 6 - Window Tile Map Display Select (0=9800-9BFF, 1=9C00-9FFF)
 * Bit 5 - Window Display Enable          (0=Off, 1=On)
 * Bit 4 - BG & Window Tile Data Select   (0=8800-97FF, 1=8000-8FFF)
 * Bit 3 - BG Tile Map Display Select     (0=9800-9BFF, 1=9C00-9FFF)
 * Bit 2 - OBJ (Sprite) Size              (0=8x8, 1=8x16)
 * Bit 1 - OBJ (Sprite) Display Enable    (0=Off, 1=On)
 * Bit 0 - BG Display (for CGB see below) (0=Off, 1=On)
 */
const LCDC = 0xff40;

/**
 * FF42 - SCY - Scroll Y (R/W)
 * FF43 - SCX - Scroll X (R/W)
 *
 * Specifies the position in the 256x256 pixels BG map (32x32 tiles) which is
 * to be displayed at the upper/left LCD display position.
 *
 * Values in range from 0-255 may be used for X/Y each, the video controller
 * automatically wraps back to the upper (left) position in BG map when drawing
 * exceeds the lower (right) border of the BG map area.
 */
const SCY = 0xff42;
const SCX = 0xff43;

/**
 * FF47 - BGP - BG Palette Data (R/W) - Non CGB Mode Only
 *
 * This register assigns gray shades to the color numbers of the BG and Window
 * tiles.
 * Bit 7-6 - Shade for Color Number 3
 * Bit 5-4 - Shade for Color Number 2
 * Bit 3-2 - Shade for Color Number 1
 * Bit 1-0 - Shade for Color Number 0
 *
 * The four possible gray shades are:
 * 0  White
 * 1  Light gray
 * 2  Dark gray
 * 3  Black
 *
 * In CGB Mode the Color Palettes are taken from CGB Palette Memory instead.
 */
const BGP = 0xff47;


class Screen extends EventEmitter {
    constructor (mmu) {
        super();

        this._mmu = mmu;

        // Canvas

        this._canvas = new Canvas(FRAME_WIDTH, FRAME_HEIGHT);
        this._ctx = this._canvas.getContext('2d');
    }

    powerOn () {
        debug('power on');
    }

    drawLine (line) {
        draw('line %d', line);

        if (line > 143) return; // V-Blank

        if (line == 0) {
            this._ctx.fillStyle = 'white';
            this._ctx.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
        }

        const scrollY = this._mmu.readByte(SCY);

        /**
         * BG Map Tile Number
         *
         * An area of VRAM known as Background Tile Map contains the numbers of
         * tiles to be displayed. It is organized as 32 rows of 32 bytes each.
         * Each byte contains a number of a tile to be displayed. Tile patterns
         * are taken from the Tile Data Table located either at $8000-8FFF or
         * $8800-97FF. In the first case, patterns are numbered with unsigned
         * numbers from 0 to 255 (i.e. pattern #0 lies at address $8000).
         * In the second case, patterns have signed numbers from -128 to
         * 127 (i.e. pattern #0 lies at address $9000). The Tile Data Table
         * address for the background can be selected via LCDC register.
         */
        const lineOffset = line + scrollY;
        const map = 0x9800 + Math.floor(lineOffset / 8) * 32;

        for (let t = 0; t < 20; t++) {
            const tile = this._mmu.readByte(t + map);
            const data = this._mmu.readWord(0x8000 + tile * 16 + (lineOffset % 8) * 2);
            for (let x = 7; x > -1; x--) {
                const px1 = data >> 8;
                const px2 = data & 0xff;
                if (px1 >> x & 1 || px2 >> x & 1) {
                    const image = this._ctx.createImageData(1, 1);
                    const px = 8 * t + 7 - x;

                    pixel('drawing at %d, %d', px, line);

                    image.data[0] = 0;
                    image.data[1] = 0;
                    image.data[2] = 0;
                    image.data[3] = 255;

                    this._ctx.putImageData(image, px, line);
                }
            }
        }
    }

    render () {
        debug('render');

        // LCD Display Enable

        const control = this._mmu.readByte(LCDC);
        if (control & 0x80 == 0) {
            return;
        }

        this.emit('frame', this._canvas.toBuffer());
    }
}

module.exports = Screen;