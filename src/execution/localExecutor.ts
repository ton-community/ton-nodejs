import BN from "bn.js";
import { Address, Cell, StackItem, TonClient4, TupleSlice4 } from "ton";
import { runContract } from "./runContract";

export type LocalExecutor = {
    run(name: string, args?: StackItem[]): Promise<{
        stack: TupleSlice4;
        gasConsumed: number;
    }>
};

export async function createLocalExecutor(
    client: TonClient4,
    block: number,
    address: Address
): Promise<LocalExecutor> {

    // Fetch config
    let config = Cell.fromBoc(Buffer.from((await client.getConfig(block)).config.cell, 'base64'))[0];

    // Fetch state
    let state = await client.getAccount(block, address);
    if (state.account.state.type !== 'active') {
        throw Error('Account is not active');
    }
    let code = Cell.fromBoc(Buffer.from(state.account.state.code, 'base64'))[0];
    let data = Cell.fromBoc(Buffer.from(state.account.state.data, 'base64'))[0];
    let balance = new BN(state.account.balance.coins, 10);
    let lt = new BN(0);

    // Create executor
    const run = async (name: string, args?: StackItem[]) => {
        return await runContract({
            method: name,
            code,
            data,
            address,
            balance,
            config,
            lt,
            stack: args ? args : []
        });
    };

    return {
        run
    }
}