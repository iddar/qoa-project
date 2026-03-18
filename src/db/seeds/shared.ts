import { and, eq } from "drizzle-orm";
import { db } from "../client";
import {
  accumulations,
  balances,
  brands,
  campaignBalances,
  campaignPolicies,
  campaignStoreEnrollments,
  campaignSubscriptions,
  campaigns,
  cpgs,
  cpgStoreRelations,
  products,
  redemptions,
  rewards,
  stores,
  transactionItems,
  transactions,
  users,
} from "../schema";
import { ensureUserUniversalWalletCard } from "../../services/wallet-onboarding";
import { UNIVERSAL_CAMPAIGN_KEY } from "../../services/wallet-onboarding";

type SeedUser = {
  email: string;
  phone: string;
  name: string;
  role:
    | "consumer"
    | "customer"
    | "store_staff"
    | "store_admin"
    | "cpg_admin"
    | "qoa_support"
    | "qoa_admin";
  password: string;
  tenantId?: string;
  tenantType?: "cpg" | "store";
};

const DEFAULT_PASSWORD = "Password123!";

// ── Direcciones realistas CDMX / Estado de México ───────────────────────────
type SeedStoreAddress = {
  street: string;
  exteriorNumber: string;
  interiorNumber: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  type: string;
};

const SEED_STORE_ADDRESSES: SeedStoreAddress[] = [
  // ── CDMX ──
  {
    street: "Av. Insurgentes Sur",
    exteriorNumber: "1602",
    interiorNumber: null,
    neighborhood: "Crédito Constructor",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03940",
    country: "MEX",
    latitude: "19.3720100",
    longitude: "-99.1774200",
    type: "tiendita",
  },
  {
    street: "Calz. de Tlalpan",
    exteriorNumber: "1234",
    interiorNumber: "A",
    neighborhood: "Portales Sur",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03portal",
    country: "MEX",
    latitude: "19.3590500",
    longitude: "-99.1430800",
    type: "minisuper",
  },
  {
    street: "Eje Central Lázaro Cárdenas",
    exteriorNumber: "245",
    interiorNumber: null,
    neighborhood: "Doctores",
    city: "Cuauhtémoc",
    state: "Ciudad de México",
    postalCode: "06720",
    country: "MEX",
    latitude: "19.4195300",
    longitude: "-99.1440600",
    type: "tiendita",
  },
  {
    street: "Av. Revolución",
    exteriorNumber: "780",
    interiorNumber: null,
    neighborhood: "San Ángel",
    city: "Álvaro Obregón",
    state: "Ciudad de México",
    postalCode: "01000",
    country: "MEX",
    latitude: "19.3465100",
    longitude: "-99.1897500",
    type: "superette",
  },
  {
    street: "Av. Universidad",
    exteriorNumber: "1200",
    interiorNumber: "B",
    neighborhood: "Del Valle Centro",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03100",
    country: "MEX",
    latitude: "19.3779200",
    longitude: "-99.1700300",
    type: "minisuper",
  },
  {
    street: "Calz. de los Misterios",
    exteriorNumber: "62",
    interiorNumber: null,
    neighborhood: "Tepeyac Insurgentes",
    city: "Gustavo A. Madero",
    state: "Ciudad de México",
    postalCode: "07020",
    country: "MEX",
    latitude: "19.4855700",
    longitude: "-99.1173400",
    type: "tiendita",
  },
  {
    street: "Av. Coyoacán",
    exteriorNumber: "1520",
    interiorNumber: null,
    neighborhood: "Del Valle Sur",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03104",
    country: "MEX",
    latitude: "19.3710600",
    longitude: "-99.1607200",
    type: "tiendita",
  },
  {
    street: "Av. Chapultepec",
    exteriorNumber: "400",
    interiorNumber: "3",
    neighborhood: "Roma Norte",
    city: "Cuauhtémoc",
    state: "Ciudad de México",
    postalCode: "06700",
    country: "MEX",
    latitude: "19.4170200",
    longitude: "-99.1605800",
    type: "minisuper",
  },
  {
    street: "Calle Madero",
    exteriorNumber: "17",
    interiorNumber: null,
    neighborhood: "Centro Histórico",
    city: "Cuauhtémoc",
    state: "Ciudad de México",
    postalCode: "06000",
    country: "MEX",
    latitude: "19.4333600",
    longitude: "-99.1389100",
    type: "tiendita",
  },
  {
    street: "Av. Patriotismo",
    exteriorNumber: "820",
    interiorNumber: null,
    neighborhood: "Mixcoac",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03910",
    country: "MEX",
    latitude: "19.3735400",
    longitude: "-99.1855700",
    type: "superette",
  },
  {
    street: "Periférico Sur",
    exteriorNumber: "4690",
    interiorNumber: null,
    neighborhood: "Pedregal de Carrasco",
    city: "Coyoacán",
    state: "Ciudad de México",
    postalCode: "04700",
    country: "MEX",
    latitude: "19.3087200",
    longitude: "-99.1971500",
    type: "cadena",
  },
  {
    street: "Av. Taxqueña",
    exteriorNumber: "1500",
    interiorNumber: null,
    neighborhood: "Paseos de Taxqueña",
    city: "Coyoacán",
    state: "Ciudad de México",
    postalCode: "04250",
    country: "MEX",
    latitude: "19.3440100",
    longitude: "-99.1410700",
    type: "tiendita",
  },
  {
    street: "Av. Tláhuac",
    exteriorNumber: "3855",
    interiorNumber: null,
    neighborhood: "Santa Cecilia",
    city: "Tláhuac",
    state: "Ciudad de México",
    postalCode: "13010",
    country: "MEX",
    latitude: "19.2840300",
    longitude: "-99.0040500",
    type: "tiendita",
  },
  {
    street: "Calz. Ignacio Zaragoza",
    exteriorNumber: "2010",
    interiorNumber: null,
    neighborhood: "Juan Escutia",
    city: "Iztapalapa",
    state: "Ciudad de México",
    postalCode: "09100",
    country: "MEX",
    latitude: "19.4065200",
    longitude: "-99.0440800",
    type: "minisuper",
  },
  {
    street: "Av. Oceanía",
    exteriorNumber: "340",
    interiorNumber: "L-5",
    neighborhood: "Romero Rubio",
    city: "Venustiano Carranza",
    state: "Ciudad de México",
    postalCode: "15400",
    country: "MEX",
    latitude: "19.4410300",
    longitude: "-99.0935600",
    type: "tiendita",
  },
  {
    street: "Av. Canal de Miramontes",
    exteriorNumber: "2950",
    interiorNumber: null,
    neighborhood: "Girasoles",
    city: "Coyoacán",
    state: "Ciudad de México",
    postalCode: "04920",
    country: "MEX",
    latitude: "19.3010500",
    longitude: "-99.1270300",
    type: "superette",
  },
  {
    street: "Av. Miguel Ángel de Quevedo",
    exteriorNumber: "687",
    interiorNumber: null,
    neighborhood: "Barrio Santa Catarina",
    city: "Coyoacán",
    state: "Ciudad de México",
    postalCode: "04010",
    country: "MEX",
    latitude: "19.3465800",
    longitude: "-99.1635200",
    type: "tiendita",
  },
  {
    street: "Calz. de la Viga",
    exteriorNumber: "1110",
    interiorNumber: null,
    neighborhood: "Militar Marte",
    city: "Iztacalco",
    state: "Ciudad de México",
    postalCode: "08830",
    country: "MEX",
    latitude: "19.3910200",
    longitude: "-99.1145300",
    type: "minisuper",
  },
  {
    street: "Av. Cuauhtémoc",
    exteriorNumber: "950",
    interiorNumber: null,
    neighborhood: "Narvarte Poniente",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03020",
    country: "MEX",
    latitude: "19.3970400",
    longitude: "-99.1530100",
    type: "tiendita",
  },
  {
    street: "Av. Río Churubusco",
    exteriorNumber: "600",
    interiorNumber: "2A",
    neighborhood: "El Sifón",
    city: "Iztapalapa",
    state: "Ciudad de México",
    postalCode: "09400",
    country: "MEX",
    latitude: "19.3560700",
    longitude: "-99.1190200",
    type: "tiendita",
  },
  {
    street: "Av. Prol. División del Norte",
    exteriorNumber: "5234",
    interiorNumber: null,
    neighborhood: "Barrio San Marcos",
    city: "Xochimilco",
    state: "Ciudad de México",
    postalCode: "16090",
    country: "MEX",
    latitude: "19.2670300",
    longitude: "-99.1085400",
    type: "tiendita",
  },
  {
    street: "Calle Corregidora",
    exteriorNumber: "80",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Cuauhtémoc",
    state: "Ciudad de México",
    postalCode: "06060",
    country: "MEX",
    latitude: "19.4290100",
    longitude: "-99.1340500",
    type: "minisuper",
  },
  {
    street: "Av. México-Coyoacán",
    exteriorNumber: "345",
    interiorNumber: null,
    neighborhood: "Xoco",
    city: "Benito Juárez",
    state: "Ciudad de México",
    postalCode: "03330",
    country: "MEX",
    latitude: "19.3610800",
    longitude: "-99.1640500",
    type: "tiendita",
  },
  {
    street: "Av. Santa Fe",
    exteriorNumber: "94",
    interiorNumber: "P.B.",
    neighborhood: "Santa Fe",
    city: "Álvaro Obregón",
    state: "Ciudad de México",
    postalCode: "01210",
    country: "MEX",
    latitude: "19.3660500",
    longitude: "-99.2610700",
    type: "cadena",
  },
  {
    street: "Av. San Jerónimo",
    exteriorNumber: "263",
    interiorNumber: null,
    neighborhood: "La Otra Banda",
    city: "Coyoacán",
    state: "Ciudad de México",
    postalCode: "04519",
    country: "MEX",
    latitude: "19.3355200",
    longitude: "-99.1850300",
    type: "superette",
  },
  // ── Estado de México ──
  {
    street: "Blvd. Manuel Ávila Camacho",
    exteriorNumber: "1007",
    interiorNumber: null,
    neighborhood: "La Florida",
    city: "Naucalpan de Juárez",
    state: "Estado de México",
    postalCode: "53160",
    country: "MEX",
    latitude: "19.4810200",
    longitude: "-99.2350600",
    type: "cadena",
  },
  {
    street: "Av. Gustavo Baz",
    exteriorNumber: "180",
    interiorNumber: null,
    neighborhood: "San Bartolo Naucalpan",
    city: "Naucalpan de Juárez",
    state: "Estado de México",
    postalCode: "53000",
    country: "MEX",
    latitude: "19.4740500",
    longitude: "-99.2260300",
    type: "minisuper",
  },
  {
    street: "Calle Benito Juárez",
    exteriorNumber: "42",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Tlalnepantla de Baz",
    state: "Estado de México",
    postalCode: "54000",
    country: "MEX",
    latitude: "19.5370200",
    longitude: "-99.1960400",
    type: "tiendita",
  },
  {
    street: "Av. 1° de Mayo",
    exteriorNumber: "311",
    interiorNumber: null,
    neighborhood: "Maravillas",
    city: "Nezahualcóyotl",
    state: "Estado de México",
    postalCode: "57410",
    country: "MEX",
    latitude: "19.4100300",
    longitude: "-99.0140700",
    type: "tiendita",
  },
  {
    street: "Av. Central",
    exteriorNumber: "520",
    interiorNumber: "8",
    neighborhood: "Valle de Aragón 1a Sección",
    city: "Ecatepec de Morelos",
    state: "Estado de México",
    postalCode: "55280",
    country: "MEX",
    latitude: "19.5130500",
    longitude: "-99.0430200",
    type: "minisuper",
  },
  {
    street: "Av. José López Portillo",
    exteriorNumber: "270",
    interiorNumber: null,
    neighborhood: "San Francisco Chilpan",
    city: "Tultitlán",
    state: "Estado de México",
    postalCode: "54940",
    country: "MEX",
    latitude: "19.6290100",
    longitude: "-99.1710500",
    type: "tiendita",
  },
  {
    street: "Blvd. Adolfo López Mateos",
    exteriorNumber: "1650",
    interiorNumber: null,
    neighborhood: "Atlampa",
    city: "Atizapán de Zaragoza",
    state: "Estado de México",
    postalCode: "52910",
    country: "MEX",
    latitude: "19.5670300",
    longitude: "-99.2540800",
    type: "superette",
  },
  {
    street: "Av. Miguel Hidalgo",
    exteriorNumber: "100",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Cuautitlán Izcalli",
    state: "Estado de México",
    postalCode: "54700",
    country: "MEX",
    latitude: "19.6480200",
    longitude: "-99.2100500",
    type: "tiendita",
  },
  {
    street: "Calle Morelos",
    exteriorNumber: "56",
    interiorNumber: null,
    neighborhood: "San Mateo Atenco Centro",
    city: "San Mateo Atenco",
    state: "Estado de México",
    postalCode: "52100",
    country: "MEX",
    latitude: "19.2680400",
    longitude: "-99.5320600",
    type: "tiendita",
  },
  {
    street: "Av. Solidaridad Las Torres",
    exteriorNumber: "431",
    interiorNumber: null,
    neighborhood: "La Loma",
    city: "Toluca",
    state: "Estado de México",
    postalCode: "50060",
    country: "MEX",
    latitude: "19.2940300",
    longitude: "-99.6550700",
    type: "minisuper",
  },
  {
    street: "Calle 5 de Febrero",
    exteriorNumber: "88",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Texcoco",
    state: "Estado de México",
    postalCode: "56100",
    country: "MEX",
    latitude: "19.5140200",
    longitude: "-98.8820400",
    type: "tiendita",
  },
  {
    street: "Calle Nezahualcóyotl",
    exteriorNumber: "200",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Chimalhuacán",
    state: "Estado de México",
    postalCode: "56330",
    country: "MEX",
    latitude: "19.4340500",
    longitude: "-98.9530600",
    type: "tiendita",
  },
  {
    street: "Av. Vicente Guerrero",
    exteriorNumber: "75",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Los Reyes La Paz",
    state: "Estado de México",
    postalCode: "56400",
    country: "MEX",
    latitude: "19.3620800",
    longitude: "-98.9730200",
    type: "minisuper",
  },
  {
    street: "Calle Hidalgo",
    exteriorNumber: "34",
    interiorNumber: "B",
    neighborhood: "San Juan",
    city: "Ixtapaluca",
    state: "Estado de México",
    postalCode: "56530",
    country: "MEX",
    latitude: "19.3180400",
    longitude: "-98.8820600",
    type: "tiendita",
  },
  {
    street: "Av. Chimalhuacán",
    exteriorNumber: "678",
    interiorNumber: null,
    neighborhood: "Benito Juárez",
    city: "Nezahualcóyotl",
    state: "Estado de México",
    postalCode: "57000",
    country: "MEX",
    latitude: "19.4010200",
    longitude: "-98.9930500",
    type: "superette",
  },
  {
    street: "Av. 16 de Septiembre",
    exteriorNumber: "210",
    interiorNumber: null,
    neighborhood: "Fraccionamiento Industrial",
    city: "Toluca",
    state: "Estado de México",
    postalCode: "50000",
    country: "MEX",
    latitude: "19.2860100",
    longitude: "-99.6530400",
    type: "cadena",
  },
  {
    street: "Av. Morelos Norte",
    exteriorNumber: "412",
    interiorNumber: null,
    neighborhood: "San Bernardino",
    city: "Toluca",
    state: "Estado de México",
    postalCode: "50080",
    country: "MEX",
    latitude: "19.2990500",
    longitude: "-99.6510300",
    type: "tiendita",
  },
  {
    street: "Calle Allende",
    exteriorNumber: "15",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Chalco",
    state: "Estado de México",
    postalCode: "56600",
    country: "MEX",
    latitude: "19.2640300",
    longitude: "-98.8970500",
    type: "tiendita",
  },
  {
    street: "Blvd. Coacalco-Tultepec",
    exteriorNumber: "310",
    interiorNumber: null,
    neighborhood: "Villa de las Flores",
    city: "Coacalco de Berriozábal",
    state: "Estado de México",
    postalCode: "55710",
    country: "MEX",
    latitude: "19.6310200",
    longitude: "-99.1110400",
    type: "minisuper",
  },
  {
    street: "Av. Alfredo del Mazo",
    exteriorNumber: "1500",
    interiorNumber: null,
    neighborhood: "Científicos",
    city: "Toluca",
    state: "Estado de México",
    postalCode: "50075",
    country: "MEX",
    latitude: "19.3120400",
    longitude: "-99.6440500",
    type: "superette",
  },
  {
    street: "Calle 2 de Marzo",
    exteriorNumber: "44",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Metepec",
    state: "Estado de México",
    postalCode: "52140",
    country: "MEX",
    latitude: "19.2560700",
    longitude: "-99.6040300",
    type: "tiendita",
  },
  {
    street: "Av. Tecnológico",
    exteriorNumber: "800",
    interiorNumber: "L-3",
    neighborhood: "Llano Grande",
    city: "Metepec",
    state: "Estado de México",
    postalCode: "52148",
    country: "MEX",
    latitude: "19.2450300",
    longitude: "-99.6110500",
    type: "minisuper",
  },
  {
    street: "Calle Independencia",
    exteriorNumber: "22",
    interiorNumber: null,
    neighborhood: "Centro",
    city: "Zinacantepec",
    state: "Estado de México",
    postalCode: "51350",
    country: "MEX",
    latitude: "19.2840500",
    longitude: "-99.7350200",
    type: "tiendita",
  },
  {
    street: "Av. Estado de México",
    exteriorNumber: "1305",
    interiorNumber: null,
    neighborhood: "Fraccionamiento Industrial",
    city: "Ecatepec de Morelos",
    state: "Estado de México",
    postalCode: "55000",
    country: "MEX",
    latitude: "19.5290400",
    longitude: "-99.0600300",
    type: "cadena",
  },
];

const buildAddress = (addr: SeedStoreAddress): string => {
  const interior = addr.interiorNumber ? ` Int. ${addr.interiorNumber}` : "";
  return `${addr.street} ${addr.exteriorNumber}${interior}, ${addr.neighborhood}, ${addr.city}, ${addr.state} C.P. ${addr.postalCode}`;
};

const TOTAL_SEED_STORES = 100;
const RELATED_SEED_STORES = 50;

type SeedStorePayload = {
  code: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string | null;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
};

const formatCoordinate = (value: string, offset: number) => (Number(value) + offset).toFixed(7);

const buildSeedStoreVariants = (scope: string, count: number): SeedStorePayload[] => {
  const variants: SeedStorePayload[] = [];

  for (let index = 0; index < count; index += 1) {
    const base = SEED_STORE_ADDRESSES[index % SEED_STORE_ADDRESSES.length]!;
    const cycle = Math.floor(index / SEED_STORE_ADDRESSES.length);
    const sequence = index + 1;
    const codeSuffix = String(sequence).padStart(3, "0");
    const spread = cycle * 0.0105 + (index % 5) * 0.0017;
    const latOffset = index % 2 === 0 ? spread : -spread;
    const lngOffset = index % 3 === 0 ? -spread * 0.9 : spread * 0.8;
    const exteriorNumber =
      cycle === 0
        ? base.exteriorNumber
        : `${base.exteriorNumber}${String.fromCharCode(65 + cycle - 1)}`;
    const interiorNumber = cycle === 0 ? base.interiorNumber : `${cycle}`;
    const cityLabel = cycle === 0 ? base.city : `${base.city} Norte`;
    const storeRecord: SeedStoreAddress = {
      ...base,
      exteriorNumber,
      interiorNumber,
      city: cityLabel,
      latitude: formatCoordinate(base.latitude, latOffset),
      longitude: formatCoordinate(base.longitude, lngOffset),
    };

    variants.push({
      code: `seed_store_${scope}_${codeSuffix}`,
      name: `${base.neighborhood} ${sequence} (${scope})`,
      type: base.type,
      address: buildAddress(storeRecord),
      phone: `+521559${String(sequence).padStart(7, "0")}`,
      street: storeRecord.street,
      exteriorNumber: storeRecord.exteriorNumber,
      interiorNumber: storeRecord.interiorNumber,
      neighborhood: storeRecord.neighborhood,
      city: storeRecord.city,
      state: storeRecord.state,
      postalCode: storeRecord.postalCode,
      country: storeRecord.country,
      latitude: storeRecord.latitude,
      longitude: storeRecord.longitude,
    });
  }

  return variants;
};

const upsertSeedStore = async (scope: string): Promise<string> => {
  const code = `seed_store_${scope}`;
  const addr = SEED_STORE_ADDRESSES[0]!;
  const name = `Tienda Seed (${scope})`;

  const [existing] = (await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.code, code))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(stores)
      .set({
        name,
        type: addr.type,
        address: buildAddress(addr),
        phone: `+52155888000${scope === "test" ? "01" : scope === "local" ? "02" : "03"}`,
        street: addr.street,
        exteriorNumber: addr.exteriorNumber,
        interiorNumber: addr.interiorNumber,
        neighborhood: addr.neighborhood,
        city: addr.city,
        state: addr.state,
        postalCode: addr.postalCode,
        country: addr.country,
        latitude: addr.latitude,
        longitude: addr.longitude,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(stores)
    .values({
      code,
      name,
      type: addr.type,
      address: buildAddress(addr),
      phone: `+52155888000${scope === "test" ? "01" : scope === "local" ? "02" : "03"}`,
      street: addr.street,
      exteriorNumber: addr.exteriorNumber,
      interiorNumber: addr.interiorNumber,
      neighborhood: addr.neighborhood,
      city: addr.city,
      state: addr.state,
      postalCode: addr.postalCode,
      country: addr.country,
      latitude: addr.latitude,
      longitude: addr.longitude,
      status: "active",
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedBrand = async (scope: string, cpgId: string): Promise<string> => {
  const name = `Brand Seed (${scope})`;

  const [existing] = (await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.cpgId, cpgId), eq(brands.name, name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(brands)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(brands.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(brands)
    .values({
      cpgId,
      name,
      status: "active",
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedProduct = async (scope: string, brandId: string): Promise<string> => {
  const sku = `SEED-${scope.toUpperCase()}-001`;

  const [existing] = (await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(products)
      .set({
        brandId,
        name: `Producto Seed (${scope})`,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(products)
    .values({
      brandId,
      sku,
      name: `Producto Seed (${scope})`,
      status: "active",
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedCampaign = async (scope: string, cpgId: string): Promise<string> => {
  const key = `qoa_seed_reto_${scope}`;

  const [existing] = (await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.key, key))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(campaigns)
      .set({
        name: `Reto Seed (${scope})`,
        description: "Campaña de prueba para wallet/rewards en entorno local.",
        cpgId,
        status: "active",
        enrollmentMode: "opt_in",
        startsAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(campaigns)
    .values({
      key,
      name: `Reto Seed (${scope})`,
      description: "Campaña de prueba para wallet/rewards en entorno local.",
      cpgId,
      status: "active",
      enrollmentMode: "opt_in",
      startsAt: new Date(),
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertSeedReward = async (scope: string, campaignId: string): Promise<string> => {
  const name = `Recompensa Seed (${scope})`;

  const [existing] = (await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(eq(rewards.campaignId, campaignId), eq(rewards.name, name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(rewards)
      .set({
        cost: 10,
        stock: 100,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(rewards.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(rewards)
    .values({
      campaignId,
      name,
      description: "Recompensa seed para pruebas funcionales.",
      cost: 10,
      stock: 100,
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: rewards.id })) as Array<{ id: string }>;

  return inserted!.id;
};

const upsertStoreByCode = async (payload: {
  code: string;
  name: string;
  type: string;
  address: string;
  phone: string;
  street?: string;
  exteriorNumber?: string;
  interiorNumber?: string | null;
  neighborhood?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}): Promise<string> => {
  const [existing] = (await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.code, payload.code))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(stores)
      .set({
        name: payload.name,
        type: payload.type,
        address: payload.address,
        phone: payload.phone,
        street: payload.street ?? null,
        exteriorNumber: payload.exteriorNumber ?? null,
        interiorNumber: payload.interiorNumber ?? null,
        neighborhood: payload.neighborhood ?? null,
        city: payload.city ?? null,
        state: payload.state ?? null,
        postalCode: payload.postalCode ?? null,
        country: payload.country ?? "MEX",
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(stores.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(stores)
    .values({
      code: payload.code,
      name: payload.name,
      type: payload.type,
      address: payload.address,
      phone: payload.phone,
      street: payload.street ?? null,
      exteriorNumber: payload.exteriorNumber ?? null,
      interiorNumber: payload.interiorNumber ?? null,
      neighborhood: payload.neighborhood ?? null,
      city: payload.city ?? null,
      state: payload.state ?? null,
      postalCode: payload.postalCode ?? null,
      country: payload.country ?? "MEX",
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      status: "active",
    })
    .returning({ id: stores.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertCpgStoreRelation = async (payload: {
  cpgId: string;
  storeId: string;
  status: "active" | "inactive";
  source?: "first_activity" | "manual" | "import";
  actorUserId?: string | null;
  touchedAt?: Date;
}) => {
  const now = payload.touchedAt ?? new Date();
  const [existing] = (await db
    .select({
      id: cpgStoreRelations.id,
      firstActivityAt: cpgStoreRelations.firstActivityAt,
    })
    .from(cpgStoreRelations)
    .where(
      and(
        eq(cpgStoreRelations.cpgId, payload.cpgId),
        eq(cpgStoreRelations.storeId, payload.storeId),
      ),
    )
    .limit(1)) as Array<{
    id: string;
    firstActivityAt: Date | null;
  }>;

  if (existing) {
    await db
      .update(cpgStoreRelations)
      .set({
        status: payload.status,
        source: payload.source ?? "manual",
        firstActivityAt:
          payload.status === "active"
            ? (existing.firstActivityAt ?? now)
            : existing.firstActivityAt,
        lastActivityAt: payload.status === "active" ? now : existing.firstActivityAt,
        updatedAt: now,
      })
      .where(eq(cpgStoreRelations.id, existing.id));
    return;
  }

  await db.insert(cpgStoreRelations).values({
    cpgId: payload.cpgId,
    storeId: payload.storeId,
    status: payload.status,
    source: payload.source ?? "manual",
    firstActivityAt: payload.status === "active" ? now : null,
    lastActivityAt: payload.status === "active" ? now : null,
    createdByUserId: payload.actorUserId ?? null,
    createdAt: now,
    updatedAt: now,
  });
};

const upsertBrandByName = async (cpgId: string, name: string): Promise<string> => {
  const [existing] = (await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.cpgId, cpgId), eq(brands.name, name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(brands)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(brands.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(brands)
    .values({
      cpgId,
      name,
      status: "active",
    })
    .returning({ id: brands.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertProductBySku = async (brandId: string, sku: string, name: string): Promise<string> => {
  const [existing] = (await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.sku, sku))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(products)
      .set({
        brandId,
        name,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(products.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(products)
    .values({
      brandId,
      sku,
      name,
      status: "active",
    })
    .returning({ id: products.id })) as Array<{ id: string }>;

  return created!.id;
};

const upsertCampaignByKey = async (payload: {
  key: string;
  name: string;
  description: string;
  cpgId: string;
  enrollmentMode: "open" | "opt_in" | "system_universal";
  storeAccessMode?: "all_related_stores" | "selected_stores";
  storeEnrollmentMode?: "store_opt_in" | "cpg_managed" | "auto_enroll";
  startsAt?: Date;
  status: string;
}): Promise<string> => {
  const [existing] = (await db
    .select({ id: campaigns.id })
    .from(campaigns)
    .where(eq(campaigns.key, payload.key))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(campaigns)
      .set({
        name: payload.name,
        description: payload.description,
        cpgId: payload.cpgId,
        status: payload.status,
        enrollmentMode: payload.enrollmentMode,
        storeAccessMode: payload.storeAccessMode ?? "selected_stores",
        storeEnrollmentMode: payload.storeEnrollmentMode ?? "store_opt_in",
        startsAt: payload.startsAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(campaigns)
    .values({
      key: payload.key,
      name: payload.name,
      description: payload.description,
      cpgId: payload.cpgId,
      status: payload.status,
      enrollmentMode: payload.enrollmentMode,
      storeAccessMode: payload.storeAccessMode ?? "selected_stores",
      storeEnrollmentMode: payload.storeEnrollmentMode ?? "store_opt_in",
      startsAt: payload.startsAt ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: campaigns.id })) as Array<{ id: string }>;

  return created!.id;
};

const syncCampaignStoreAssignments = async (payload: {
  campaignId: string;
  storeIds: string[];
  actorUserId?: string | null;
  status?: "visible" | "invited" | "enrolled";
  visibilitySource?: "manual" | "zone" | "import" | "auto_related";
  enrollmentSource?: "cpg_managed" | "store_opt_in" | "auto_enroll";
}) => {
  const targetIds = [...new Set(payload.storeIds)];
  const now = new Date();
  const existingRows = (await db
    .select({
      id: campaignStoreEnrollments.id,
      storeId: campaignStoreEnrollments.storeId,
    })
    .from(campaignStoreEnrollments)
    .where(eq(campaignStoreEnrollments.campaignId, payload.campaignId))) as Array<{
    id: string;
    storeId: string;
  }>;

  const existingByStoreId = new Map(existingRows.map((row) => [row.storeId, row]));

  for (const storeId of targetIds) {
    const existing = existingByStoreId.get(storeId);
    if (existing) {
      await db
        .update(campaignStoreEnrollments)
        .set({
          status: payload.status ?? "visible",
          visibilitySource: payload.visibilitySource ?? "manual",
          enrollmentSource: payload.enrollmentSource ?? null,
          invitedByUserId: payload.actorUserId ?? null,
          updatedAt: now,
          removedAt: null,
        })
        .where(eq(campaignStoreEnrollments.id, existing.id));
      continue;
    }

    await db.insert(campaignStoreEnrollments).values({
      campaignId: payload.campaignId,
      storeId,
      status: payload.status ?? "visible",
      visibilitySource: payload.visibilitySource ?? "manual",
      enrollmentSource: payload.enrollmentSource ?? null,
      invitedByUserId: payload.actorUserId ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const storesToRemove = existingRows.filter((row) => !targetIds.includes(row.storeId));
  for (const row of storesToRemove) {
    await db
      .update(campaignStoreEnrollments)
      .set({
        status: "removed",
        removedAt: now,
        updatedAt: now,
      })
      .where(eq(campaignStoreEnrollments.id, row.id));
  }
};

const upsertRewardByName = async (payload: {
  campaignId: string;
  name: string;
  description: string;
  cost: number;
  stock: number;
}): Promise<string> => {
  const [existing] = (await db
    .select({ id: rewards.id })
    .from(rewards)
    .where(and(eq(rewards.campaignId, payload.campaignId), eq(rewards.name, payload.name)))
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(rewards)
      .set({
        description: payload.description,
        cost: payload.cost,
        stock: payload.stock,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(rewards.id, existing.id));
    return existing.id;
  }

  const [created] = (await db
    .insert(rewards)
    .values({
      campaignId: payload.campaignId,
      name: payload.name,
      description: payload.description,
      cost: payload.cost,
      stock: payload.stock,
      status: "active",
      updatedAt: new Date(),
    })
    .returning({ id: rewards.id })) as Array<{ id: string }>;

  return created!.id;
};

const ensurePolicy = async (payload: {
  campaignId: string;
  policyType: "max_accumulations" | "min_amount" | "min_quantity" | "cooldown";
  scopeType: "campaign" | "brand" | "product";
  period: "transaction" | "day" | "week" | "month" | "lifetime";
  value: number;
}) => {
  const [existing] = (await db
    .select({ id: campaignPolicies.id })
    .from(campaignPolicies)
    .where(
      and(
        eq(campaignPolicies.campaignId, payload.campaignId),
        eq(campaignPolicies.policyType, payload.policyType),
        eq(campaignPolicies.scopeType, payload.scopeType),
        eq(campaignPolicies.period, payload.period),
      ),
    )
    .limit(1)) as Array<{ id: string }>;

  if (existing) {
    await db
      .update(campaignPolicies)
      .set({
        value: payload.value,
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(campaignPolicies.id, existing.id));
    return;
  }

  await db.insert(campaignPolicies).values({
    campaignId: payload.campaignId,
    policyType: payload.policyType,
    scopeType: payload.scopeType,
    period: payload.period,
    value: payload.value,
    active: true,
    updatedAt: new Date(),
  });
};

/**
 * Upsert a seed CPG and return its id.
 * Uses the CPG name as the stable identity key.
 */
const upsertSeedCpg = async (scope: string): Promise<string> => {
  const name = `Acme CPG (${scope})`;

  const [existing] = (await db
    .select({ id: cpgs.id })
    .from(cpgs)
    .where(eq(cpgs.name, name))
    .limit(1)) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(cpgs)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(cpgs.id, existing.id));
    return existing.id;
  }

  const [inserted] = (await db
    .insert(cpgs)
    .values({ name, status: "active" })
    .returning({ id: cpgs.id })) as Array<{
    id: string;
  }>;

  return inserted!.id;
};

const ensureSubscribed = async (userId: string, campaignId: string) => {
  const [existing] = (await db
    .select({ id: campaignSubscriptions.id })
    .from(campaignSubscriptions)
    .where(
      and(
        eq(campaignSubscriptions.userId, userId),
        eq(campaignSubscriptions.campaignId, campaignId),
      ),
    )) as Array<{
    id: string;
  }>;

  if (existing) {
    await db
      .update(campaignSubscriptions)
      .set({
        status: "subscribed",
        subscribedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(campaignSubscriptions.id, existing.id));
    return;
  }

  await db.insert(campaignSubscriptions).values({
    userId,
    campaignId,
    status: "subscribed",
    subscribedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
};

const addPoints = async (payload: {
  cardId: string;
  campaignId: string;
  transactionItemId: string;
  amount: number;
  createdAt: Date;
  balanceState: { current: number; lifetime: number };
  campaignState: Map<string, { current: number; lifetime: number }>;
}) => {
  payload.balanceState.current += payload.amount;
  payload.balanceState.lifetime += payload.amount;

  const campaignCurrent = payload.campaignState.get(payload.campaignId) ?? {
    current: 0,
    lifetime: 0,
  };
  campaignCurrent.current += payload.amount;
  campaignCurrent.lifetime += payload.amount;
  payload.campaignState.set(payload.campaignId, campaignCurrent);

  await db.insert(accumulations).values({
    transactionItemId: payload.transactionItemId,
    cardId: payload.cardId,
    campaignId: payload.campaignId,
    amount: payload.amount,
    balanceAfter: campaignCurrent.current,
    sourceType: "transaction_item",
    createdAt: payload.createdAt,
  });

  const [existingCampaignBalance] = (await db
    .select({ id: campaignBalances.id })
    .from(campaignBalances)
    .where(
      and(
        eq(campaignBalances.cardId, payload.cardId),
        eq(campaignBalances.campaignId, payload.campaignId),
      ),
    )) as Array<{
    id: string;
  }>;

  if (existingCampaignBalance) {
    await db
      .update(campaignBalances)
      .set({
        current: campaignCurrent.current,
        lifetime: campaignCurrent.lifetime,
        updatedAt: payload.createdAt,
      })
      .where(eq(campaignBalances.id, existingCampaignBalance.id));
  } else {
    await db.insert(campaignBalances).values({
      cardId: payload.cardId,
      campaignId: payload.campaignId,
      current: campaignCurrent.current,
      lifetime: campaignCurrent.lifetime,
      updatedAt: payload.createdAt,
    });
  }

  const [existingBalance] = (await db
    .select({ id: balances.id })
    .from(balances)
    .where(eq(balances.cardId, payload.cardId))) as Array<{ id: string }>;

  if (existingBalance) {
    await db
      .update(balances)
      .set({
        current: payload.balanceState.current,
        lifetime: payload.balanceState.lifetime,
        updatedAt: payload.createdAt,
      })
      .where(eq(balances.id, existingBalance.id));
  } else {
    await db.insert(balances).values({
      cardId: payload.cardId,
      current: payload.balanceState.current,
      lifetime: payload.balanceState.lifetime,
      updatedAt: payload.createdAt,
    });
  }
};

const seedDemoActivity = async (payload: {
  scope: "development" | "local";
  consumerUserId: string;
  consumerCardId: string;
  primaryStoreId: string;
  secondaryStoreId: string;
  productIds: string[];
  universalCampaignId: string;
  retoCampaignId: string;
  openCampaignId: string;
  rewardIds: string[];
}) => {
  const seedPrefix = `seed:${payload.scope}:demo:tx:`;
  const existingSeedTxRows = (await db
    .select({ idempotencyKey: transactions.idempotencyKey })
    .from(transactions)
    .where(eq(transactions.userId, payload.consumerUserId))) as Array<{
    idempotencyKey: string | null;
  }>;
  const existingSeedKeys = new Set(
    existingSeedTxRows
      .map((row) => row.idempotencyKey)
      .filter(
        (value): value is string => typeof value === "string" && value.startsWith(seedPrefix),
      ),
  );

  const [balanceRow] = (await db
    .select({ current: balances.current, lifetime: balances.lifetime })
    .from(balances)
    .where(eq(balances.cardId, payload.consumerCardId))) as Array<{
    current: number;
    lifetime: number;
  }>;
  const balanceState = {
    current: balanceRow?.current ?? 0,
    lifetime: balanceRow?.lifetime ?? 0,
  };

  const campaignRows = (await db
    .select({
      campaignId: campaignBalances.campaignId,
      current: campaignBalances.current,
      lifetime: campaignBalances.lifetime,
    })
    .from(campaignBalances)
    .where(eq(campaignBalances.cardId, payload.consumerCardId))) as Array<{
    campaignId: string;
    current: number;
    lifetime: number;
  }>;
  const campaignState = new Map<string, { current: number; lifetime: number }>();
  for (const row of campaignRows) {
    campaignState.set(row.campaignId, {
      current: row.current,
      lifetime: row.lifetime,
    });
  }

  const now = Date.now();
  for (let dayOffset = 29; dayOffset >= 0; dayOffset -= 1) {
    const txPerDay = dayOffset % 3 === 0 ? 3 : dayOffset % 2 === 0 ? 2 : 1;

    for (let txIndex = 0; txIndex < txPerDay; txIndex += 1) {
      const idempotencyKey = `${seedPrefix}${dayOffset}:${txIndex}`;
      if (existingSeedKeys.has(idempotencyKey)) {
        continue;
      }

      const createdAt = new Date(now - dayOffset * 24 * 60 * 60 * 1000);
      createdAt.setUTCHours(10 + txIndex * 3, (dayOffset * 7) % 60, 0, 0);

      const storeId =
        (dayOffset + txIndex) % 4 === 0 ? payload.secondaryStoreId : payload.primaryStoreId;
      const productId =
        payload.productIds[(dayOffset + txIndex) % payload.productIds.length] ??
        payload.productIds[0];
      const quantity = (dayOffset + txIndex) % 5 === 0 ? 2 : 1;
      const amount = 55 + ((dayOffset * 11 + txIndex * 17) % 150);
      const totalAmount = amount * quantity;

      const [tx] = (await db
        .insert(transactions)
        .values({
          userId: payload.consumerUserId,
          storeId,
          cardId: payload.consumerCardId,
          idempotencyKey,
          totalAmount,
          metadata: `demo seed ${payload.scope}`,
          createdAt,
        })
        .returning({ id: transactions.id })) as Array<{ id: string }>;

      if (!tx) {
        continue;
      }

      const [item] = (await db
        .insert(transactionItems)
        .values({
          transactionId: tx.id,
          productId,
          quantity,
          amount,
          metadata: "seed demo item",
        })
        .returning({ id: transactionItems.id })) as Array<{ id: string }>;

      if (!item) {
        continue;
      }

      const points = Math.max(8, Math.round(totalAmount / 12));
      await addPoints({
        cardId: payload.consumerCardId,
        campaignId: payload.universalCampaignId,
        transactionItemId: item.id,
        amount: points,
        createdAt,
        balanceState,
        campaignState,
      });

      if ((dayOffset + txIndex) % 2 === 0) {
        await addPoints({
          cardId: payload.consumerCardId,
          campaignId: payload.retoCampaignId,
          transactionItemId: item.id,
          amount: Math.max(4, Math.round(points * 0.8)),
          createdAt,
          balanceState,
          campaignState,
        });
      }

      if ((dayOffset + txIndex) % 3 === 0) {
        await addPoints({
          cardId: payload.consumerCardId,
          campaignId: payload.openCampaignId,
          transactionItemId: item.id,
          amount: Math.max(3, Math.round(points * 0.6)),
          createdAt,
          balanceState,
          campaignState,
        });
      }
    }
  }

  const existingRedemptionRows = (await db
    .select({ id: redemptions.id })
    .from(redemptions)
    .where(
      and(eq(redemptions.cardId, payload.consumerCardId), eq(redemptions.status, "completed")),
    )) as Array<{
    id: string;
  }>;
  const skipRedemptions = existingRedemptionRows.length >= 6;

  if (!skipRedemptions) {
    const rewardIdsSet = new Set(payload.rewardIds);
    const rewardRows = (await db
      .select({
        id: rewards.id,
        campaignId: rewards.campaignId,
        cost: rewards.cost,
        stock: rewards.stock,
      })
      .from(rewards)) as Array<{
      id: string;
      campaignId: string;
      cost: number;
      stock: number | null;
    }>;
    const filteredRewards = rewardRows.filter((row) => rewardIdsSet.has(row.id));

    for (let index = 0; index < Math.min(8, filteredRewards.length * 2); index += 1) {
      const reward = filteredRewards[index % filteredRewards.length];
      if (!reward) {
        continue;
      }

      const campaignCurrent = campaignState.get(reward.campaignId)?.current ?? 0;
      if (campaignCurrent < reward.cost + 5) {
        continue;
      }

      const createdAt = new Date(now - (index + 1) * 3 * 24 * 60 * 60 * 1000);
      await db.insert(redemptions).values({
        cardId: payload.consumerCardId,
        rewardId: reward.id,
        cost: reward.cost,
        status: "completed",
        createdAt,
        completedAt: createdAt,
      });

      campaignState.set(reward.campaignId, {
        current: campaignCurrent - reward.cost,
        lifetime: campaignState.get(reward.campaignId)?.lifetime ?? campaignCurrent,
      });
      balanceState.current -= reward.cost;

      const [existingCampaignBalance] = (await db
        .select({ id: campaignBalances.id })
        .from(campaignBalances)
        .where(
          and(
            eq(campaignBalances.cardId, payload.consumerCardId),
            eq(campaignBalances.campaignId, reward.campaignId),
          ),
        )) as Array<{ id: string }>;

      if (existingCampaignBalance) {
        await db
          .update(campaignBalances)
          .set({
            current: campaignCurrent - reward.cost,
            lifetime: campaignState.get(reward.campaignId)?.lifetime ?? campaignCurrent,
            updatedAt: createdAt,
          })
          .where(eq(campaignBalances.id, existingCampaignBalance.id));
      } else {
        await db.insert(campaignBalances).values({
          cardId: payload.consumerCardId,
          campaignId: reward.campaignId,
          current: campaignCurrent - reward.cost,
          lifetime: campaignState.get(reward.campaignId)?.lifetime ?? campaignCurrent,
          updatedAt: createdAt,
        });
      }

      const [existingBalance] = (await db
        .select({ id: balances.id })
        .from(balances)
        .where(eq(balances.cardId, payload.consumerCardId))) as Array<{ id: string }>;

      if (existingBalance) {
        await db
          .update(balances)
          .set({
            current: balanceState.current,
            lifetime: balanceState.lifetime,
            updatedAt: createdAt,
          })
          .where(eq(balances.id, existingBalance.id));
      } else {
        await db.insert(balances).values({
          cardId: payload.consumerCardId,
          current: balanceState.current,
          lifetime: balanceState.lifetime,
          updatedAt: createdAt,
        });
      }

      if (typeof reward.stock === "number") {
        await db
          .update(rewards)
          .set({
            stock: Math.max(0, reward.stock - 1),
            updatedAt: createdAt,
          })
          .where(eq(rewards.id, reward.id));
      }
    }
  }
};

const baseUsers = (scope: string, cpgId: string, storeId: string): SeedUser[] => [
  {
    email: `admin.${scope}@qoa.local`,
    phone: `+52155100000${scope === "test" ? "01" : scope === "local" ? "02" : "03"}`,
    name: `Qoa Admin (${scope})`,
    role: "qoa_admin",
    password: DEFAULT_PASSWORD,
  },
  {
    email: `support.${scope}@qoa.local`,
    phone: `+52155100000${scope === "test" ? "11" : scope === "local" ? "12" : "13"}`,
    name: `Qoa Support (${scope})`,
    role: "qoa_support",
    password: DEFAULT_PASSWORD,
  },
  {
    email: `store.${scope}@qoa.local`,
    phone: `+52155100000${scope === "test" ? "21" : scope === "local" ? "22" : "23"}`,
    name: `Store Admin (${scope})`,
    role: "store_admin",
    password: DEFAULT_PASSWORD,
    tenantId: storeId,
    tenantType: "store",
  },
  {
    email: `consumer.${scope}@qoa.local`,
    phone: `+52155100000${scope === "test" ? "31" : scope === "local" ? "32" : "33"}`,
    name: `Consumer (${scope})`,
    role: "consumer",
    password: DEFAULT_PASSWORD,
  },
  {
    email: `cpg.${scope}@qoa.local`,
    phone: `+52155100000${scope === "test" ? "41" : scope === "local" ? "42" : "43"}`,
    name: `CPG Admin (${scope})`,
    role: "cpg_admin",
    password: DEFAULT_PASSWORD,
    tenantId: cpgId,
    tenantType: "cpg",
  },
];

export const seedUsers = async (scope: "development" | "local" | "test") => {
  const cpgId = await upsertSeedCpg(scope);
  const storeId = await upsertSeedStore(scope);
  const brandId = await upsertSeedBrand(scope, cpgId);
  const productId = await upsertSeedProduct(scope, brandId);
  const campaignId = await upsertSeedCampaign(scope, cpgId);
  const rewardId = await upsertSeedReward(scope, campaignId);
  const definitions = baseUsers(scope, cpgId, storeId);
  const userIdsByEmail = new Map<string, string>();

  for (const seedUser of definitions) {
    const passwordHash = await Bun.password.hash(seedUser.password);
    const [existing] = (await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, seedUser.email))
      .limit(1)) as Array<{ id: string }>;

    let userId = existing?.id ?? null;

    if (existing) {
      await db
        .update(users)
        .set({
          phone: seedUser.phone,
          name: seedUser.name,
          role: seedUser.role,
          passwordHash,
          status: "active",
          blockedAt: null,
          blockedUntil: null,
          blockedReason: null,
          tenantId: seedUser.tenantId ?? null,
          tenantType: seedUser.tenantType ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const [inserted] = (await db
        .insert(users)
        .values({
          email: seedUser.email,
          phone: seedUser.phone,
          name: seedUser.name,
          role: seedUser.role,
          passwordHash,
          status: "active",
          tenantId: seedUser.tenantId,
          tenantType: seedUser.tenantType,
        })
        .returning({ id: users.id })) as Array<{ id: string }>;

      userId = inserted?.id ?? null;
    }

    if (userId && (seedUser.role === "consumer" || seedUser.role === "customer")) {
      await ensureUserUniversalWalletCard(userId);
    }

    if (userId) {
      userIdsByEmail.set(seedUser.email, userId);
    }
  }

  if (scope === "development" || scope === "local") {
    const addrB = SEED_STORE_ADDRESSES[1]!;
    const secondaryStoreId = await upsertStoreByCode({
      code: `seed_store_b_${scope}`,
      name: `Tienda Seed B (${scope})`,
      type: addrB.type,
      address: buildAddress(addrB),
      phone: `+52155899000${scope === "local" ? "12" : "13"}`,
      street: addrB.street,
      exteriorNumber: addrB.exteriorNumber,
      interiorNumber: addrB.interiorNumber,
      neighborhood: addrB.neighborhood,
      city: addrB.city,
      state: addrB.state,
      postalCode: addrB.postalCode,
      country: addrB.country,
      latitude: addrB.latitude,
      longitude: addrB.longitude,
    });

    const bulkStores = buildSeedStoreVariants(scope, TOTAL_SEED_STORES - 2);
    const bulkStoreIds: string[] = [];
    for (const bulkStore of bulkStores) {
      bulkStoreIds.push(await upsertStoreByCode(bulkStore));
    }

    const cpgAdminId = userIdsByEmail.get(`cpg.${scope}@qoa.local`) ?? null;
    const managedStoreIds = [storeId, secondaryStoreId, ...bulkStoreIds];
    const activeStoreIds = new Set(managedStoreIds.slice(0, RELATED_SEED_STORES));
    const selectedStoreIdsForSeedCampaign = managedStoreIds.slice(0, 10);
    const editableStoreIdsForSeedCampaign = managedStoreIds.slice(10, 15);

    for (const managedStoreId of managedStoreIds) {
      await upsertCpgStoreRelation({
        cpgId,
        storeId: managedStoreId,
        status: activeStoreIds.has(managedStoreId) ? "active" : "inactive",
        source: "manual",
        actorUserId: cpgAdminId,
      });
    }

    const brandIds = [
      await upsertBrandByName(cpgId, `Brand Plus (${scope})`),
      await upsertBrandByName(cpgId, `Brand Max (${scope})`),
      await upsertBrandByName(cpgId, `Brand Flex (${scope})`),
    ];

    const productIds = [
      productId,
      await upsertProductBySku(
        brandIds[0]!,
        `SEED-${scope.toUpperCase()}-002`,
        `Producto Plus 2 (${scope})`,
      ),
      await upsertProductBySku(
        brandIds[1]!,
        `SEED-${scope.toUpperCase()}-003`,
        `Producto Max 3 (${scope})`,
      ),
      await upsertProductBySku(
        brandIds[2]!,
        `SEED-${scope.toUpperCase()}-004`,
        `Producto Flex 4 (${scope})`,
      ),
      await upsertProductBySku(
        brandIds[0]!,
        `SEED-${scope.toUpperCase()}-005`,
        `Producto Plus 5 (${scope})`,
      ),
      await upsertProductBySku(
        brandIds[1]!,
        `SEED-${scope.toUpperCase()}-006`,
        `Producto Max 6 (${scope})`,
      ),
    ];

    const openCampaignId = await upsertCampaignByKey({
      key: `qoa_seed_open_${scope}`,
      name: `Campaña Open Seed (${scope})`,
      description: "Campaña abierta para demo de acumulaciones adicionales.",
      cpgId,
      storeAccessMode: "all_related_stores",
      storeEnrollmentMode: "auto_enroll",
      enrollmentMode: "open",
      status: "active",
    });

    const flashCampaignId = await upsertCampaignByKey({
      key: `qoa_seed_flash_${scope}`,
      name: `Campaña Flash Seed (${scope})`,
      description: "Campaña de temporada para demostrar variantes de rewards.",
      cpgId,
      storeAccessMode: "selected_stores",
      storeEnrollmentMode: "store_opt_in",
      enrollmentMode: "opt_in",
      status: "active",
    });

    await upsertCampaignByKey({
      key: `qoa_seed_reto_${scope}`,
      name: `Reto Seed (${scope})`,
      description: "Campaña de prueba para wallet/rewards en entorno local.",
      cpgId,
      storeAccessMode: "selected_stores",
      storeEnrollmentMode: "store_opt_in",
      enrollmentMode: "opt_in",
      status: "draft",
      startsAt: new Date(),
    });

    await syncCampaignStoreAssignments({
      campaignId,
      storeIds: editableStoreIdsForSeedCampaign,
      actorUserId: cpgAdminId,
      status: "visible",
      visibilitySource: "manual",
      enrollmentSource: "cpg_managed",
    });

    await syncCampaignStoreAssignments({
      campaignId: flashCampaignId,
      storeIds: selectedStoreIdsForSeedCampaign,
      actorUserId: cpgAdminId,
      status: "visible",
      visibilitySource: "manual",
      enrollmentSource: "cpg_managed",
    });

    await syncCampaignStoreAssignments({
      campaignId: openCampaignId,
      storeIds: [],
      actorUserId: cpgAdminId,
    });

    const rewardIds = [
      rewardId,
      await upsertRewardByName({
        campaignId,
        name: `Cupón 2x1 Seed (${scope})`,
        description: "Cupón promocional para demos de canje.",
        cost: 30,
        stock: 120,
      }),
      await upsertRewardByName({
        campaignId: openCampaignId,
        name: `Reward Open Plus (${scope})`,
        description: "Reward activa para campaña abierta.",
        cost: 20,
        stock: 140,
      }),
      await upsertRewardByName({
        campaignId: openCampaignId,
        name: `Reward Open Max (${scope})`,
        description: "Reward adicional para demostrar variedad.",
        cost: 45,
        stock: 90,
      }),
      await upsertRewardByName({
        campaignId: flashCampaignId,
        name: `Reward Flash (${scope})`,
        description: "Reward de campaña flash.",
        cost: 25,
        stock: 80,
      }),
    ];

    await ensurePolicy({
      campaignId,
      policyType: "min_amount",
      scopeType: "campaign",
      period: "transaction",
      value: 80,
    });
    await ensurePolicy({
      campaignId,
      policyType: "max_accumulations",
      scopeType: "campaign",
      period: "day",
      value: 3,
    });
    await ensurePolicy({
      campaignId: openCampaignId,
      policyType: "min_quantity",
      scopeType: "campaign",
      period: "transaction",
      value: 2,
    });
    await ensurePolicy({
      campaignId: openCampaignId,
      policyType: "cooldown",
      scopeType: "campaign",
      period: "day",
      value: 1,
    });
    await ensurePolicy({
      campaignId: flashCampaignId,
      policyType: "min_amount",
      scopeType: "campaign",
      period: "transaction",
      value: 120,
    });

    const consumerEmail = `consumer.${scope}@qoa.local`;
    const consumerUserId = userIdsByEmail.get(consumerEmail);
    if (consumerUserId) {
      const ensuredCard = await ensureUserUniversalWalletCard(consumerUserId);
      await ensureSubscribed(consumerUserId, campaignId);
      await ensureSubscribed(consumerUserId, flashCampaignId);

      const [universal] = (await db
        .select({ id: campaigns.id })
        .from(campaigns)
        .where(eq(campaigns.key, UNIVERSAL_CAMPAIGN_KEY))) as Array<{ id: string }>;

      if (universal?.id) {
        await seedDemoActivity({
          scope,
          consumerUserId,
          consumerCardId: ensuredCard.cardId,
          primaryStoreId: storeId,
          secondaryStoreId,
          productIds,
          universalCampaignId: universal.id,
          retoCampaignId: campaignId,
          openCampaignId,
          rewardIds,
        });
      }
    }
  }

  console.log(`[seed:${scope}] CPG seed: ${cpgId} (Acme CPG)`);
  console.log(`[seed:${scope}] Store seed: ${storeId} (Tienda Seed)`);
  console.log(`[seed:${scope}] Brand seed: ${brandId}`);
  console.log(`[seed:${scope}] Product seed: ${productId}`);
  console.log(`[seed:${scope}] Campaign seed: ${campaignId} (qoa_seed_reto_${scope})`);
  console.log(`[seed:${scope}] Reward seed: ${rewardId}`);
  if (scope === "development" || scope === "local") {
    console.log(
      `[seed:${scope}] Demo data: 30 días de transacciones + campañas/recompensas extra + ${RELATED_SEED_STORES} tiendas relacionadas de ${TOTAL_SEED_STORES} disponibles`,
    );
  }
  console.log(`[seed:${scope}] usuarios listos:`);
  for (const seedUser of definitions) {
    const tenant = seedUser.tenantId ? ` [tenant: ${seedUser.tenantId}]` : "";
    console.log(`- ${seedUser.role} -> ${seedUser.email} / ${seedUser.password}${tenant}`);
  }
};
