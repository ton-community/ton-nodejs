import BN from "bn.js";
import { Address, Cell, TonClient4 } from "ton";
import { ContractExecutor } from "./ContractExecutor";

export async function createExecutorFromRemote(
    client: TonClient4,
    block: number,
    address: Address
): Promise<ContractExecutor> {

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

    // Create executor
    return new ContractExecutor({ code, data, balance, config, address });
}