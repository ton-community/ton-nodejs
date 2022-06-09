import BN from "bn.js";
import { randomBytes } from "crypto";
import { Address, beginCell, Cell, ExternalMessage, InternalMessage, StackItem, TupleSlice4 } from "ton";
import { TVMStackEntry, TVMStackEntryCell, TVMStackEntryCellSlice, TVMStackEntryInt, TVMStackEntryNull, TVMStackEntryTuple, runContract as executeContract, parseActionsList, OutAction } from 'ton-contract-executor';
import { convertFromExecutorStack, convertToExecutorStack } from "./convert";

const makeIntEntry = (value: number | BN): TVMStackEntryInt => ({ type: 'int', value: value.toString(10) });
const makeTuple = (items: TVMStackEntry[]): TVMStackEntryTuple => ({ type: 'tuple', value: items });
const makeNull = (): TVMStackEntryNull => ({ type: 'null' });
const makeCell = (cell: Cell): TVMStackEntryCell => ({ type: 'cell', value: cell.toBoc({ idx: false }).toString('base64') });
const makeSlice = (cell: Cell): TVMStackEntryCellSlice => ({ type: 'cell_slice', value: cell.toBoc({ idx: false }).toString('base64') });
const decodeLogs = (logs: string) => Buffer.from(logs, 'base64').toString();

export class ContractExecutor {

    #code: Cell;
    #data: Cell;
    #balance: BN;
    #config: Cell;
    #address: Address;
    #now: number;
    #blockLt: BN;
    #accountLt: BN;

    get code() {
        return this.#code;
    }

    get data() {
        return this.#data;
    }

    get balance() {
        return this.#balance;
    }

    get address() {
        return this.#address;
    }

    get now() {
        return this.#now;
    }

    constructor(args: { code: Cell, data: Cell, balance?: BN, config?: Cell, address?: Address, now?: number, lt?: BN }) {
        this.#code = args.code;
        this.#data = args.data;
        this.#balance = args.balance ? args.balance : new BN(0);
        this.#config = args.config ? args.config : new Cell();
        this.#address = args.address ? args.address : new Address(0, Buffer.alloc(32, 0));
        this.#now = args.now ? args.now : Math.floor(Date.now() / 1000);
        this.#blockLt = args.lt ? args.lt : new BN(0);
        this.#accountLt = this.#blockLt;
    }

    update(args: { config?: Cell, balance?: BN, now?: number | true, lt?: BN }) {
        if (args.config) {
            this.#config = args.config;
        }
        if (args.balance) {
            this.#balance = args.balance;
        }
        if (args.now === true) {
            this.#now = Math.floor(Date.now() / 1000);
        }
        if (typeof args.now === 'number') {
            this.#now = args.now;
        }
        if (args.lt) {
            this.#blockLt = args.lt;
            this.#accountLt = this.#blockLt;
        }
    }

    async execute(name: string, stack: StackItem[], opts?: { debug?: boolean }) {

        // Convert
        let convertedStack = convertToExecutorStack(stack);

        // Configure
        let balance = makeTuple([makeIntEntry(this.#balance), makeNull()]);
        let addressCell = new Cell();
        addressCell.bits.writeAddress(this.#address);
        let randSeed = randomBytes(32);

        // auto tuple = vm::make_tuple_ref(
        //     td::make_refint(0x076ef1ea),                // [ magic:0x076ef1ea
        //     td::zero_refint(),                          //   actions:Integer
        //     td::zero_refint(),                          //   msgs_sent:Integer
        //     td::make_refint(now),                       //   unixtime:Integer
        //     td::make_refint(account.block_lt),          //   block_lt:Integer
        //     td::make_refint(start_lt),                  //   trans_lt:Integer
        //     std::move(rand_seed_int),                   //   rand_seed:Integer
        //     balance.as_vm_tuple(),                      //   balance_remaining:[Integer (Maybe Cell)]
        //     my_addr,                                    //  myself:MsgAddressInt
        //     vm::StackEntry::maybe(cfg.global_config));  //  global_config:(Maybe Cell) ] = SmartContractInfo;
        let c7 = makeTuple([
            makeTuple([
                // [ magic:0x076ef1ea
                makeIntEntry(0x076ef1ea),
                // actions:Integer
                makeIntEntry(0),
                // msgs_sent:Integer
                makeIntEntry(0),
                // unixtime:Integer
                makeIntEntry(this.#now),
                // block_lt:Integer
                makeIntEntry(this.#blockLt),
                // trans_lt:Integer
                makeIntEntry(this.#accountLt),
                // rand_seed:Integer
                makeIntEntry(new BN(randSeed)),
                // balance_remaining:[Integer (Maybe Cell)]
                balance,
                // myself:MsgAddressInt
                makeSlice(beginCell()
                    .storeAddress(this.#address)
                    .endCell()),
                // global_config:(Maybe Cell) ] = SmartContractInfo;
                makeCell(this.#config)
            ])
        ]);

        // Execute
        let result = await executeContract({
            code: this.#code,
            dataCell: this.#data,
            stack: convertedStack,
            method: name,
            c7,
            debug: opts ? !!opts.debug : false,

        });

        // Process results
        if (!result.ok) {
            throw Error('Exit code: ' + result.exit_code);
        }

        // Resolve result
        let logs = decodeLogs(result.logs);
        let gasConsumed = result.gas_consumed;
        let resultStack = convertFromExecutorStack(result.stack);

        // Results
        let actions: OutAction[] = [];
        if (result.action_list_cell) {
            actions = parseActionsList(Cell.fromBoc(Buffer.from(result.action_list_cell, 'base64'))[0]);
        }

        // Persist data, code and LT
        if (name === 'recv_external' || name === 'recv_internal') {
            if (result.data_cell) {
                this.#data = Cell.fromBoc(Buffer.from(result.data_cell, 'base64'))[0];
            }
            for (let a of actions) {
                if (a.type === 'set_code') {
                    this.#code = a.newCode;
                }
            }
            this.#accountLt = this.#accountLt.addn(1);
        }

        return {
            result: resultStack,
            gasConsumed,
            logs,
            actions
        };
    }

    async get(name: string, stack?: StackItem[], opts?: { debug?: boolean }) {
        let result = await this.execute(name, stack ? stack : [], opts);
        return {
            logs: result.logs,
            gasConsumed: result.gasConsumed,
            stack: new TupleSlice4(result.result),
            stackRaw: result.result
        };
    }

    async internal(msg: InternalMessage, opts?: { debug?: boolean }) {

        // Serialize
        let msgCell = new Cell();
        msg.writeTo(msgCell);
        if (!msg.body.body) {
            throw new Error('No body was provided for message');
        }
        let bodyCell = new Cell();
        msg.body.body.writeTo(bodyCell);

        // Execute
        let result = await this.execute('recv_internal', [
            { type: 'int', value: this.#balance },
            { type: 'int', value: msg.value },
            { type: 'cell', cell: msgCell },
            { type: 'slice', cell: bodyCell }
        ], opts);

        return {
            logs: result.logs,
            gasConsumed: result.gasConsumed,
            actions: result.actions
        };
    }

    async external(msg: ExternalMessage, opts?: { debug?: boolean }) {

        // Serialize
        let msgCell = new Cell();
        msg.writeTo(msgCell);
        if (!msg.body.body) {
            throw new Error('No body was provided for message');
        }
        let bodyCell = new Cell();
        msg.body.body.writeTo(bodyCell);

        // Execute
        let result = await this.execute('recv_external', [
            { type: 'int', value: this.#balance },
            { type: 'int', value: new BN(0) },
            { type: 'cell', cell: msgCell },
            { type: 'slice', cell: bodyCell }
        ], opts);

        return {
            logs: result.logs,
            gasConsumed: result.gasConsumed,
            actions: result.actions
        };
    }
}