import { Address, fromNano, TonClient4 } from "ton";
import { createLocalExecutor } from "./localExecutor";

describe('localExecutor', () => {
    it('should fetch pool state', async () => {
        const client = new TonClient4({ endpoint: 'https://sandbox-v4.tonhubapi.com' });
        const executor = await createLocalExecutor(client, 479216, Address.parse('EQDsPXQhe6Jg5hZYATRfYwne0o_RbReMG2P3zHfcFUwHAAwY'));
        const response = await executor.run('get_staking_status');
        let stakeAt = response.stack.readNumber();
        let stakeUntil = response.stack.readNumber();
        let stakeSent = response.stack.readBigNumber();
        let querySent = response.stack.readBoolean();
        let couldUnlock = response.stack.readBoolean();
        let locked = response.stack.readBoolean();
        expect(stakeAt).toBe(1654662283);
        expect(stakeUntil).toBe(1654698583);
        expect(fromNano(stakeSent)).toEqual('49999.8');
        expect(querySent).toBe(false);
        expect(couldUnlock).toBe(true);
        expect(locked).toBe(true);
    });
});