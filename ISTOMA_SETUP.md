# Configurare iStoma pentru integrare WhatsApp Bot

## Ce trebuie configurat în platforma iStoma

Pentru ca botul WhatsApp să poată programa pacienți în iStoma, trebuie să ai următoarele configurate corect:

### 1. **Cheie API și URL**

- **URL Base**: `https://supersmilesib.digitalclinic.ro/api/PacientAPI/`
- **Cheie API**: Cheia ta reală din contract (nu cea de test)
- **Act adițional**: "Mobile pacient view" activat (24 RON +TVA x numărul de scaune / lună)

### 2. **Structură clinică** (Setări → Structură clinică)

- **Sedii** (Sediile tale):
  - Ex: SUPERSMILE SIB, SUPERSMILE - ARHITECTILOR
  - Fiecare sediu trebuie să aibă un **ID** (se vede în `GetListaSedii`)

- **Cabinete** (Unități funcționale):
  - Ex: Cabinet 1, Cabinet 2
  - Fiecare cabinet trebuie asociat unui sediu
  - Fiecare cabinet trebuie să aibă un **ID** (se vede în răspunsurile `GetListaIntervaleActivitate`)

### 3. **Medici** (Resurse umane → Echipa)

- **Medicii trebuie să fie creați**:
  - Dr. COROIAN Andrei
  - Dr. CRETIU Raul
  - Dr. PAVEL Iulia
  - Dr. UDECI Madalina

- **Fiecare medic trebuie să aibă**:
  - Un **ID** (se vede în `GetMedici`)
  - **Program de lucru** definit (zilele și orele când lucrează)
  - **Asociere la sediu și cabinet** (unde lucrează)

### 4. **Program medici** (Agendă → Program medici)

**CRITIC**: Pentru ca `GetListaIntervaleActivitate` să returneze sloturi, trebuie:

- **Programul să fie definit** pentru fiecare medic:
  - Zilele în care lucrează (Luni-Vineri, etc.)
  - Intervalele orare (ex: 08:00-20:00)
  - **Sediul** unde lucrează
  - **Cabinetul** unde lucrează

- **Dacă programul nu este definit** sau medicul nu e asociat la cabinet/sediu:
  - `GetListaIntervaleActivitate` va returna `null`
  - `AdaugaProgramare` va returna eroare 500/400

### 5. **Categorii de programare**

- Botul trimite `pCategorie = "Consultatie"`
- Trebuie să existe o categorie cu acest nume în iStoma sau să fie acceptată de sistem

## Verificare rapidă

### Test 1: Verifică medici și sedii

Deschide în browser:
```
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetMedici?pCheie=CHEIA_TA
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetListaSedii?pCheie=CHEIA_TA
```

Ar trebui să vezi liste cu medici și sedii.

### Test 2: Verifică sloturi disponibile

```
GET https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetListaIntervaleActivitate
  ?pCheie=CHEIA_TA
  &pDataInceputZZLLAAAA=28012026
  &pDataSfarsitZZLLAAAA=28012026
  &pOraInceput=08:00
  &pOraFinal=20:00
  &pListaIdMedici=1,2,3,4,5
  &pIdSediu=3
```

**Dacă răspunsul este `null`**:
- Verifică că medicii au program definit pentru data respectivă
- Verifică că medicii sunt asociați la sediu și cabinet
- Verifică că programul include intervalul 08:00-20:00

### Test 3: Testează programare directă

```
POST https://supersmilesib.digitalclinic.ro/api/PacientAPI/AdaugaProgramare
  ?pCheie=CHEIA_TA
  &pNumeCompletPacient=Test Nume
  &pTelefonPacient=40712345678
  &pAdresaMailPacient=
  &pDataDDMMYYYYHHMM=280120261030
  &pDurataInMinute=30
  &pIdSpecialist=1
  &pIdCabinet=ID_CABINET_CORECT
  &pCategorie=Consultatie
  &pObservatii=Test
```

**Dacă primești 500/400**:
- Verifică că `pIdSpecialist` (medic) există și are program în ziua respectivă
- Verifică că `pIdCabinet` este un ID valid de cabinet asociat medicului
- Verifică că data/ora este în intervalul de program al medicului

## Ce face botul automat

1. **Caută pacientul**: `VerificaPacient` după telefon
2. **Creează pacientul dacă nu există**: `AdaugaPacient`
3. **Caută sloturi**: `GetListaIntervaleActivitate` → `GetPrimeleSloturiLibere`
4. **Programează**: `AdaugaProgramare` → fallback `AdaugaSolicitareProgramareCuData`

**Dacă totul e configurat corect în iStoma**, botul ar trebui să funcționeze automat.

## Probleme comune

### "GetListaIntervaleActivitate returnează null"
- **Cauză**: Medici fără program definit sau fără asociere la sediu/cabinet
- **Soluție**: Definește programul pentru fiecare medic în iStoma

### "AdaugaProgramare returnează 500"
- **Cauză**: Medic/cabinet invalid sau program necompatibil
- **Soluție**: Verifică că medicul are program în ziua/ora respectivă și că cabinetul este valid

### "AdaugaSolicitareProgramareCuData returnează 400"
- **Cauză**: Parametri invalizi (sediu, categorie, etc.)
- **Soluție**: Verifică că `pIdSediu` și `pCategorie` sunt valori valide în iStoma
