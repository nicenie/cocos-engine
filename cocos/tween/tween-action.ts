/*
 Copyright (c) 2020-2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/

import { warnID, warn, easing } from '../core';
import { ActionInterval } from './actions/action-interval';
import { ITweenOption, TweenEasing } from './export-api';
import { VERSION } from '../core/global-exports';

type TypeEquality<T, U> = { [K in keyof T]: K extends keyof U ? T[K] : never } extends T ? true : false;

/** adapter */
function TweenEasingAdapter (easingName: string): string {
    const initialChar = easingName.charAt(0);
    if (/[A-Z]/.test(initialChar)) {
        easingName = easingName.replace(initialChar, initialChar.toLowerCase());
        const arr = easingName.split('-');
        if (arr.length === 2) {
            const str0 = arr[0];
            if (str0 === 'linear') {
                easingName = 'linear';
            } else {
                const str1 = arr[1];
                switch (str0) {
                case 'quadratic':
                    easingName = `quad${str1}`;
                    break;
                case 'quartic':
                    easingName = `quart${str1}`;
                    break;
                case 'quintic':
                    easingName = `quint${str1}`;
                    break;
                case 'sinusoidal':
                    easingName = `sine${str1}`;
                    break;
                case 'exponential':
                    easingName = `expo${str1}`;
                    break;
                case 'circular':
                    easingName = `circ${str1}`;
                    break;
                default:
                    easingName = str0 + str1;
                    break;
                }
            }
        }
    }
    return easingName;
}

/** checker */
function TweenOptionChecker<T> (opts: ITweenOption<T>): void {
    const header = ' [Tween:] ';
    const message = ` option is not support in v + ${VERSION}`;
    const _opts = opts as unknown as any;
    if (_opts.delay) {
        warn(`${header}delay${message}`);
    }
    if (_opts.repeat) {
        warn(`${header}repeat${message}`);
    }
    if (_opts.repeatDelay) {
        warn(`${header}repeatDelay${message}`);
    }
    if (_opts.interpolation) {
        warn(`${header}interpolation${message}`);
    }
    if (_opts.onStop) {
        warn(`${header}onStop${message}`);
    }
}

export class TweenAction<T> extends ActionInterval {
    private _opts: ITweenOption<T> | undefined;
    private _props: any;
    private _originProps: any;
    private _reversed = false;

    constructor (duration: number, props: any, opts?: ITweenOption<T>) {
        super();
        if (opts == null) {
            opts = Object.create(null);
        } else {
            /** checker */
            TweenOptionChecker(opts);

            /** adapter */
            if (opts.easing && typeof opts.easing === 'string') {
                opts.easing = TweenEasingAdapter(opts.easing) as TweenEasing;
            }

            // global easing or progress used for this action
            if (!opts.progress) {
                opts.progress = this.progress;
            }
            if (opts.easing && typeof opts.easing === 'string') {
                const easingName = opts.easing as string;
                opts.easing = easing[easingName];

                if (!opts.easing) { warnID(1031, easingName); }
            }
        }
        this._opts = opts;

        this._props = Object.create(null);
        for (const name in props) {
            // filtering if
            // - it was not own property
            // - types was function / string
            // - it was undefined / null
            // eslint-disable-next-line no-prototype-builtins
            if (!props.hasOwnProperty(name)) continue;
            let value = props[name];
            if (typeof value === 'function') {
                value = value();
            }
            if (value == null || typeof value === 'string') continue;
            // property may have custom easing or progress function
            let customEasing: any;
            let progress: any;
            if (value.value !== undefined && (value.easing || value.progress)) {
                if (typeof value.easing === 'string') {
                    customEasing = easing[value.easing];
                    if (!customEasing) warnID(1031, value.easing as string);
                } else {
                    customEasing = value.easing;
                }
                progress = value.progress;
                value = value.value;
            }

            const prop = Object.create(null);
            prop.value = value;
            prop.easing = customEasing;
            prop.progress = progress;
            this._props[name] = prop;
        }

        this._originProps = props;
        this.initWithDuration(duration);
    }

    get relative (): boolean {
        return !!this._opts!.relative;
    }

    clone (): TweenAction<T> {
        const action = new TweenAction(this._duration, this._originProps, this._opts);
        action._reversed = this._reversed;
        action.workerTarget = this.workerTarget;
        action._id = this._id;
        this._cloneDecoration(action);
        return action;
    }

    reverse (): TweenAction<T> {
        if (!this._opts!.relative) {
            warn('reverse: could not reverse a non-relative action');
            return new TweenAction<T>(0, {});
        }

        const action = new TweenAction(this._duration, this._originProps, this._opts);
        this._cloneDecoration(action);
        action._reversed = !this._reversed;
        action.workerTarget = this.workerTarget;
        return action;
    }

    startWithTarget<U> (target: U | null): void {
        const isEqual: TypeEquality<T, U> = true;
        if (!isEqual) return;
        super.startWithTarget(target);

        const workerTarget = (this.workerTarget ?? this.target) as T;
        if (!workerTarget) return;
        const relative = !!this._opts!.relative;
        const props = this._props;
        const reversed = this._reversed;
        for (const property in props) {
            const _t: any = workerTarget[property];
            if (_t === undefined) { continue; }

            const prop: any = props[property];
            const value = prop.value;
            if (typeof _t === 'number') {
                prop.start = _t;
                prop.current = _t;
                prop.end = relative ? (reversed ? _t - value : _t + value) : value;
            } else if (typeof _t === 'object') {
                if (prop.start == null) {
                    prop.start = {}; prop.current = {}; prop.end = {};
                }

                let propertyKeys: string[];
                if (value.getModifiableProperties) {
                    propertyKeys = value.getModifiableProperties();
                } else {
                    propertyKeys = Object.keys(value as object);
                }

                for (let i = 0, len = propertyKeys.length; i < len; ++i) {
                    const k = propertyKeys[i];
                    // eslint-disable-next-line no-restricted-globals
                    if (isNaN(_t[k] as number)) continue;

                    prop.start[k] = _t[k];
                    prop.current[k] = _t[k];
                    prop.end[k] = relative ? (reversed ? _t[k] - value[k] : _t[k] + value[k]) : value[k];
                }
            }
        }

        if (this._opts!.onStart) { this._opts!.onStart(workerTarget); }
    }

    update (t: number): void {
        const workerTarget = (this.workerTarget ?? this.target) as T;
        if (!workerTarget) return;

        if (!this._opts) return;

        const props = this._props;
        const opts = this._opts;

        let easingTime = t;
        if (typeof opts.easing === 'function') easingTime = opts.easing(t);

        const progress = opts.progress;
        for (const name in props) {
            const prop = props[name];
            const time = prop.easing ? prop.easing(t) : easingTime;
            const interpolation = prop.progress ? prop.progress : progress;

            const start = prop.start;
            const end = prop.end;
            if (typeof start === 'number') {
                prop.current = interpolation(start, end, prop.current, time);
            } else if (typeof start === 'object') {
                // const value = prop.value;
                for (const k in start) {
                    // if (value[k].easing) {
                    //     time = value[k].easing(t);
                    // }
                    // if (value[k].progress) {
                    //     interpolation = value[k].easing(t);
                    // }
                    prop.current[k] = interpolation(start[k], end[k], prop.current[k], time);
                }
            }

            workerTarget[name] = prop.current;
        }
        if (opts.onUpdate) { opts.onUpdate(workerTarget, t); }
        if (t === 1 && opts.onComplete) { opts.onComplete(workerTarget); }
    }

    progress (start: number, end: number, current: number, t: number): number {
        return current = start + (end - start) * t;
    }
}
