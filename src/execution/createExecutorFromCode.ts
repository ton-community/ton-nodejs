import BN from "bn.js";
import { Address, Cell } from "ton";
import { ContractExecutor } from "./ContractExecutor";

export async function createExecutorFromCode(params: { code: Cell, data: Cell, balance?: BN, address?: Address, config?: Cell, lt?: BN }) {

    // Resolve parameters
    let address = params.address ? params.address : new Address(0, Buffer.alloc(32, 0));

    // Create executor
    return new ContractExecutor({
        code: params.code,
        data: params.data,
        balance: params.balance,
        config: params.config,
        address,
        lt: params.lt
    });
}