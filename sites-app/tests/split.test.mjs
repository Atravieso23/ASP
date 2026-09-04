// Split (módulo futuro del tercer tiempo) — PR 1: SÓLO el motor matemático puro.
// NO hay state.split, NO hay UI, NO hay writer, NO hay Supabase. Nada llama a estas
// funciones todavía; este archivo es lo único que las ejercita.
//
// Mismo mecanismo que tarjetas.test.mjs: se extraen las funciones REALES de
// demo.html por nombre y corren en un node:vm, sin DOM ni red.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const demo = await readFile(new URL("../public/demo.html", import.meta.url), "utf8");

function extractFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `no encontré la función ${name} en demo.html`);
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`no pude cerrar la función ${name}`);
}

const NEEDED = ["repartirExacto", "validarGasto", "calcularBalances", "liquidarMinimo"];

function splitWorld() {
  const context = vm.createContext({
    Math, Number, Array, Object, Set, Map, String,
    console: { error() {}, warn() {}, log() {} },
  });
  vm.runInContext(NEEDED.map((n) => extractFunction(demo, n)).join("\n"), context);
  return {
    repartirExacto: (monto, n) =>
      vm.runInContext(`repartirExacto(${JSON.stringify(monto)}, ${JSON.stringify(n)})`, context),
    validarGasto: (gasto) =>
      JSON.parse(vm.runInContext(`JSON.stringify(validarGasto(${JSON.stringify(gasto)}))`, context)),
    calcularBalances: (participants, expenses) =>
      JSON.parse(
        vm.runInContext(
          `JSON.stringify(calcularBalances(${JSON.stringify(participants)}, ${JSON.stringify(expenses)}))`,
          context,
        ),
      ),
    liquidarMinimo: (balances) =>
      JSON.parse(vm.runInContext(`JSON.stringify(liquidarMinimo(${JSON.stringify(balances)}))`, context)),
    runThrows: (expr) => {
      try {
        vm.runInContext(expr, context);
        return null;
      } catch (e) {
        return e.message;
      }
    },
  };
}

const participants = [
  { id: "p1", name: "Tito" },
  { id: "p2", name: "Pablo" },
];

const expenseCervezas = {
  id: "e1",
  label: "Cervezas",
  amount: 24000,
  payers: [{ participantId: "p1", amount: 24000 }],
  consumers: ["p1", "p2"],
};

// ---------- repartirExacto ----------

test("repartirExacto: monto divide exacto entre n", () => {
  const w = splitWorld();
  assert.deepEqual(w.repartirExacto(24000, 2), [12000, 12000]);
  assert.deepEqual(w.repartirExacto(300, 3), [100, 100, 100]);
});

test("repartirExacto: monto NO divide exacto -- el resto va a los primeros de la lista", () => {
  const w = splitWorld();
  // 10000 / 3 = 3333.33: base 3333, resto 1 -> el primero se lleva $1 extra.
  assert.deepEqual(w.repartirExacto(10000, 3), [3334, 3333, 3333]);
  // 10000 / 7: base 1428, resto 4 -> los primeros 4 se llevan $1 extra.
  assert.deepEqual(w.repartirExacto(10000, 7), [1429, 1429, 1429, 1429, 1428, 1428, 1428]);
});

test("repartirExacto: la suma del resultado siempre es exactamente el monto (barrido)", () => {
  const w = splitWorld();
  for (const monto of [0, 1, 2, 3, 100, 101, 9999, 10000, 123457]) {
    for (let n = 1; n <= 13; n++) {
      const partes = w.repartirExacto(monto, n);
      assert.equal(partes.length, n, `monto=${monto} n=${n}: cantidad de partes`);
      assert.equal(
        partes.reduce((a, b) => a + b, 0),
        monto,
        `monto=${monto} n=${n}: la suma no cierra`,
      );
    }
  }
});

test("repartirExacto: n=1 se lleva todo el monto en una sola parte", () => {
  const w = splitWorld();
  assert.deepEqual(w.repartirExacto(555, 1), [555]);
});

test("repartirExacto: monto=0 reparte ceros, nunca negativos ni NaN", () => {
  const w = splitWorld();
  assert.deepEqual(w.repartirExacto(0, 4), [0, 0, 0, 0]);
});

test("repartirExacto: n<=0 falla ruidoso, nunca Infinity/NaN silencioso", () => {
  const w = splitWorld();
  assert.match(w.runThrows("repartirExacto(1000, 0)"), /n debe ser un entero/);
  assert.match(w.runThrows("repartirExacto(1000, -1)"), /n debe ser un entero/);
});

test("repartirExacto: monto inválido (negativo, no entero) falla ruidoso", () => {
  const w = splitWorld();
  assert.match(w.runThrows("repartirExacto(-1, 3)"), /monto debe ser un entero/);
  assert.match(w.runThrows("repartirExacto(100.5, 3)"), /monto debe ser un entero/);
});

// ---------- validarGasto ----------

test("validarGasto: gasto bien formado pasa", () => {
  const w = splitWorld();
  assert.deepEqual(w.validarGasto(expenseCervezas), { ok: true, motivo: null });
});

test("validarGasto: dos pagadores que suman el monto también pasa", () => {
  const w = splitWorld();
  const gasto = {
    ...expenseCervezas,
    payers: [
      { participantId: "p1", amount: 14000 },
      { participantId: "p2", amount: 10000 },
    ],
  };
  assert.equal(w.validarGasto(gasto).ok, true);
});

test("validarGasto: rechaza cuando los pagadores no cierran contra el monto", () => {
  const w = splitWorld();
  const gasto = { ...expenseCervezas, payers: [{ participantId: "p1", amount: 20000 }] };
  const r = w.validarGasto(gasto);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, "pagadores-no-cierran");
});

test("validarGasto: rechaza monto <= 0", () => {
  const w = splitWorld();
  assert.equal(w.validarGasto({ ...expenseCervezas, amount: 0 }).motivo, "monto-invalido");
  assert.equal(w.validarGasto({ ...expenseCervezas, amount: -100 }).motivo, "monto-invalido");
  assert.equal(w.validarGasto({ ...expenseCervezas, amount: 100.5 }).motivo, "monto-invalido");
});

test("validarGasto: rechaza sin consumidores (evita división por cero antes de llegar al motor)", () => {
  const w = splitWorld();
  assert.equal(w.validarGasto({ ...expenseCervezas, consumers: [] }).motivo, "sin-consumidores");
});

test("validarGasto: rechaza consumidor duplicado", () => {
  const w = splitWorld();
  assert.equal(w.validarGasto({ ...expenseCervezas, consumers: ["p1", "p1", "p2"] }).motivo, "consumidor-duplicado");
});

test("validarGasto: rechaza sin pagadores", () => {
  const w = splitWorld();
  assert.equal(w.validarGasto({ ...expenseCervezas, payers: [] }).motivo, "sin-pagadores");
});

test("validarGasto: rechaza pagador duplicado", () => {
  const w = splitWorld();
  const gasto = {
    ...expenseCervezas,
    payers: [
      { participantId: "p1", amount: 12000 },
      { participantId: "p1", amount: 12000 },
    ],
  };
  assert.equal(w.validarGasto(gasto).motivo, "pagador-duplicado");
});

test("validarGasto: rechaza monto de pagador <= 0", () => {
  const w = splitWorld();
  const gasto = { ...expenseCervezas, payers: [{ participantId: "p1", amount: 0 }] };
  assert.equal(w.validarGasto(gasto).motivo, "monto-de-pagador-invalido");
});

test("validarGasto: rechaza gasto no-objeto sin crashear", () => {
  const w = splitWorld();
  assert.equal(w.validarGasto(null).motivo, "gasto-invalido");
  assert.equal(w.validarGasto(undefined).motivo, "gasto-invalido");
});

// ---------- calcularBalances ----------

test("calcularBalances: quien paga todo y consume la mitad queda acreedor de la otra mitad", () => {
  const w = splitWorld();
  const balances = w.calcularBalances(participants, [expenseCervezas]);
  const byId = Object.fromEntries(balances.map((b) => [b.id, b.balance]));
  assert.equal(byId.p1, 12000, "p1 puso 24000 y consumió 12000 -> le deben 12000");
  assert.equal(byId.p2, -12000, "p2 no puso nada y consumió 12000 -> debe 12000");
});

test("calcularBalances: invariante -- la suma de todos los balances siempre da 0", () => {
  const w = splitWorld();
  const casos = [
    [expenseCervezas],
    [
      expenseCervezas,
      {
        id: "e2",
        label: "Hielo",
        amount: 10000,
        payers: [{ participantId: "p2", amount: 10000 }],
        consumers: ["p1", "p2"],
      },
    ],
    [
      {
        id: "e3",
        label: "Asado",
        amount: 10001,
        payers: [
          { participantId: "p1", amount: 5000 },
          { participantId: "p2", amount: 5001 },
        ],
        consumers: ["p1", "p2"],
      },
    ],
  ];
  for (const expenses of casos) {
    const balances = w.calcularBalances(participants, expenses);
    const suma = balances.reduce((a, b) => a + b.balance, 0);
    assert.equal(suma, 0, `suma de balances no da 0 para: ${JSON.stringify(expenses)}`);
  }
});

test("calcularBalances: participante que no paga ni consume nada queda en 0, no desaparece", () => {
  const w = splitWorld();
  const tresParticipantes = [...participants, { id: "p3", name: "Ale" }];
  const balances = w.calcularBalances(tresParticipantes, [expenseCervezas]);
  const p3 = balances.find((b) => b.id === "p3");
  assert.ok(p3, "p3 no puede desaparecer del resultado");
  assert.equal(p3.balance, 0);
});

test("calcularBalances: reparto con resto -- nadie pierde ni gana un peso de más", () => {
  const w = splitWorld();
  const tres = [...participants, { id: "p3", name: "Ale" }];
  const gasto = {
    id: "e4",
    label: "Asado",
    amount: 10000, // 10000/3 = 3334,3333,3333
    payers: [{ participantId: "p1", amount: 10000 }],
    consumers: ["p1", "p2", "p3"],
  };
  const balances = w.calcularBalances(tres, [gasto]);
  const byId = Object.fromEntries(balances.map((b) => [b.id, b.balance]));
  assert.equal(byId.p1, 10000 - 3334); // pagó todo, consumió el share con el peso extra
  assert.equal(byId.p2, -3333);
  assert.equal(byId.p3, -3333);
  assert.equal(balances.reduce((a, b) => a + b.balance, 0), 0);
});

test("calcularBalances: dos runs con los mismos inputs dan resultado idéntico", () => {
  const w = splitWorld();
  const a = w.calcularBalances(participants, [expenseCervezas]);
  const b = w.calcularBalances(participants, [expenseCervezas]);
  assert.deepEqual(a, b);
});

// ---------- liquidarMinimo ----------

test("liquidarMinimo: caso simple de 2 personas -- un solo pago salda todo", () => {
  const w = splitWorld();
  const balances = w.calcularBalances(participants, [expenseCervezas]);
  const pagos = w.liquidarMinimo(balances);
  assert.deepEqual(pagos, [{ de: "p2", a: "p1", monto: 12000 }]);
});

test("liquidarMinimo: balances ya en cero no generan ningún pago", () => {
  const w = splitWorld();
  assert.deepEqual(w.liquidarMinimo([{ id: "p1", balance: 0 }, { id: "p2", balance: 0 }]), []);
});

test("liquidarMinimo: invariante -- el total movido == la suma de los balances positivos", () => {
  const w = splitWorld();
  const balances = [
    { id: "a", balance: 5000 },
    { id: "b", balance: 3000 },
    { id: "c", balance: -6000 },
    { id: "d", balance: -2000 },
  ];
  const pagos = w.liquidarMinimo(balances);
  const totalMovido = pagos.reduce((acc, p) => acc + p.monto, 0);
  const totalPositivo = balances.filter((b) => b.balance > 0).reduce((acc, b) => acc + b.balance, 0);
  assert.equal(totalMovido, totalPositivo);
});

test("liquidarMinimo: nunca genera un pago de monto 0 o negativo", () => {
  const w = splitWorld();
  const balances = [
    { id: "a", balance: 100 },
    { id: "b", balance: -100 },
    { id: "c", balance: 0 },
  ];
  const pagos = w.liquidarMinimo(balances);
  for (const p of pagos) assert.ok(p.monto > 0, `pago inválido: ${JSON.stringify(p)}`);
});

test("liquidarMinimo: 4 personas cierra con a lo sumo 3 pagos (n-1)", () => {
  const w = splitWorld();
  const balances = [
    { id: "a", balance: 7000 },
    { id: "b", balance: -3000 },
    { id: "c", balance: 2000 },
    { id: "d", balance: -6000 },
  ];
  const pagos = w.liquidarMinimo(balances);
  assert.ok(pagos.length <= 3, `demasiados pagos: ${pagos.length}`);
  const totalMovido = pagos.reduce((acc, p) => acc + p.monto, 0);
  assert.equal(totalMovido, 9000); // suma de los balances positivos (7000+2000)
});

test("liquidarMinimo: es determinístico -- mismos inputs, mismo resultado", () => {
  const w = splitWorld();
  const balances = [
    { id: "a", balance: 5000 },
    { id: "b", balance: 3000 },
    { id: "c", balance: -6000 },
    { id: "d", balance: -2000 },
  ];
  assert.deepEqual(w.liquidarMinimo(balances), w.liquidarMinimo(balances));
});
