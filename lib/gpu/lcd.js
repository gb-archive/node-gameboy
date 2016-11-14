'use strict';

const step = require('debug')('gameboy:lcd:step');
const stat = require('debug')('gameboy:lcd:stat');
const { STAT, LY, LYC } = require('../registers');
const { INT_40, INT_48 } = require('../interrupts');


class Lcd {
    constructor (mmu, gpu) {
        this._mmu = mmu;
        this._gpu = gpu;

        // Registers

        this._stat = 0;
        this._ly = 0;
        this._lyc = 0;

        // Timer

        this._t = 0;
    }

    init () {
        this._stat = 0;
        this._ly = 0;
        this._lyc = 0;

        this._t = 0;
    }

    step (cycles) {
        step('%d', cycles);

        this._t += cycles;

        /**
         * Mode Flag
         *
         * The two lower STAT bits show the current status of the LCD
         * controller.
         *
         * Mode 0: The LCD controller is in the H-Blank period and
         *         the CPU can access both the display RAM (8000h-9FFFh)
         *         and OAM (FE00h-FE9Fh)
         *
         * Mode 1: The LCD contoller is in the V-Blank period (or the
         *         display is disabled) and the CPU can access both the
         *         display RAM (8000h-9FFFh) and OAM (FE00h-FE9Fh)
         *
         * Mode 2: The LCD controller is reading from OAM memory.
         *         The CPU <cannot> access OAM memory (FE00h-FE9Fh)
         *         during this period.
         *
         * Mode 3: The LCD controller is reading from both OAM and VRAM,
         *         The CPU <cannot> access OAM and VRAM during this period.
         *         CGB Mode: Cannot access Palette Data (FF69,FF6B) either.
         *
         * The following are typical when the display is enabled:
         * Mode 2  2_____2_____2_____2_____2_____2___________________2____
         * Mode 3  _33____33____33____33____33____33__________________3___
         * Mode 0  ___000___000___000___000___000___000________________000
         * Mode 1  ____________________________________11111111111111_____
         *
         * The Mode Flag goes through the values 0, 2, and 3 at a cycle of
         * about 109uS. 0 is present about 48.6uS, 2 about 19uS, and 3 about
         * 41uS. This is interrupted every 16.6ms by the VBlank (1). The mode
         * flag stays set at 1 for about 1.08 ms.
         *
         * Mode 0 is present between 201-207 clks, 2 about 77-83 clks, and 3
         * about 169-175 clks. A complete cycle through these states takes 456
         * clks. VBlank lasts 4560 clks. A complete screen refresh occurs every
         * 70224 clks.)
         */

        let mode = this._stat & 3;

        switch (mode) {
            case 2:
                if (this._t >= 80) {
                    mode = 3;
                    this._t = 0;
                }
                break;
            case 3:
                if (this._t >= 172) {
                    mode = 0;
                    this._t = 0;
                    this._gpu.drawLine(this._ly);
                }
                break;
            case 0:
                if (this._t >= 204) {
                    mode = 2;
                    this._t = 0;
                    this._ly++;

                    // V-Blank

                    if (this._ly == 144) {
                        mode = 1;
                        this._mmu.if |= INT_40;
                        this._gpu.render();
                    }
                }
                break;
            case 1:
                if (this._t >= 456) {
                    this._t = 0;
                    this._ly++;

                    if (this._ly > 153) {
                        mode = 2;
                        this._ly = 0;
                    }
                }
                break;
        }

        stat('mode=%d; ly=%d', mode, this._ly);

        // Interrupts

        if (mode != (this._stat & 3)) {
            this._stat &= ~3;
            this._stat |= mode;

            let intf = false;
            switch (mode) {
                case 0: if (this._stat & 8) intf = true; break;
                case 2: if (this._stat & 0x10) intf = true;
                case 1: if (this._stat & 0x20) intf = true;
            }

            if (intf) this._mmu.if |= INT_48;
        }

        // Coincidence line

        if (this._ly == this._lyc) {
            this._stat |= 1 << 2;
            if (this._stat & 0x40) this._mmu.if |= INT_48;
        }
        else this._stat &= ~(1 << 2);
    }

    readByte (addr) {
        switch (addr) {
            case STAT: return this._stat;
            case LY: return this._ly;
            case LYC: return this._lyc;
        }

        throw new Error(`unmapped address 0x${addr.toString(16)}`);
    }

    writeByte (addr, val) {
        switch (addr) {
            case STAT: return this._stat |= val & 0x78;
            case LY: return this._ly = 0;
            case LYC: return this._lyc = val;
        }

        throw new Error(`unmapped address 0x${addr.toString(16)}`);
    }
}

module.exports = Lcd;
