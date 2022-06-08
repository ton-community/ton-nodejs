import { BN } from "bn.js";
import { Cell, StackItem } from "ton";
import { TVMStackEntry } from "ton-contract-executor";

export function convertToExecutorStack(stack: StackItem[]): TVMStackEntry[] {
    let res: TVMStackEntry[] = [];
    for (let s of stack) {
        if (s.type === 'int') {
            res.push({ type: 'int', value: s.value.toString(10) });
        } else if (s.type === 'cell') {
            res.push({ type: 'cell', value: s.cell.toBoc({ idx: false }).toString('base64') });
        } else if (s.type === 'null') {
            res.push({ type: 'null' });
        } else if (s.type === 'slice') {
            res.push({ type: 'cell_slice', value: s.cell.toBoc({ idx: false }).toString('base64') });
        } else if (s.type === 'tuple') {
            res.push({ type: 'tuple', value: convertToExecutorStack(s.items) });
        } else {
            throw Error('Unsupported type: ' + s.type);
        }
    }
    return res;
}

export function convertFromExecutorStack(stack: TVMStackEntry[]): StackItem[] {
    let res: StackItem[] = [];
    for (let s of stack) {
        if (s.type === 'int') {
            res.push({ type: 'int', value: new BN(s.value, 10) });
        } else if (s.type === 'cell') {
            res.push({ type: 'cell', cell: Cell.fromBoc(Buffer.from(s.value, 'base64'))[0] });
        } else if (s.type === 'cell_slice') {
            res.push({ type: 'slice', cell: Cell.fromBoc(Buffer.from(s.value, 'base64'))[0] });
        } else if (s.type === 'null') {
            res.push({ type: 'null' });
        } else if (s.type === 'tuple') {
            res.push({ type: 'tuple', items: convertFromExecutorStack(s.value) });
        } else {
            throw Error('Unsupported type');
        }
    }
    return res;
}