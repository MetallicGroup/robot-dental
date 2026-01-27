# Checklist: Ce trebuie configurat în iStoma

## ✅ Verificări necesare pentru ca API-ul să returneze date

### 1. **GetMedici returnează null** ❌

**Cauze posibile:**
- Medici fără "www activ" setat
- Cheia API invalidă sau neconfigurată corect
- Act adițional "Mobile pacient view" neactivat

**Ce să faci:**
1. Deschide iStoma → **Resurse umane → Echipa**
2. Pentru fiecare medic (PAVEL, UDECI, COROIAN, CRETIU):
   - Click pe medic → **Editare**
   - Caută setarea **"www activ"** sau **"Activ pentru platformă web"**
   - **Activează** această opțiune
   - Salvează

3. Verifică **Setări → API** sau **Contracte**:
   - Cheia API trebuie să fie aceeași cu cea din `.env`
   - Act adițional "Mobile pacient view" trebuie activat

### 2. **GetListaIntervaleActivitate returnează null** ❌

**Cauze posibile:**
- Medici fără program de lucru definit
- Medici neasociați la sediu
- Medici neasociați la cabinet
- Programul nu include intervalul 08:00-21:00

**Ce să faci:**

#### Pasul 1: Asociază medicii la sediu și cabinet
1. Deschide iStoma → **Agendă → Program medici** sau **Setări → Structură clinică**
2. Pentru fiecare medic:
   - **Sediul** unde lucrează (ex: SUPERSMILE SIB, ID=3)
   - **Cabinetul** unde lucrează (Cabinet 1, ID=1 sau Cabinet 2, ID=2)

#### Pasul 2: Definește programul de lucru
1. Deschide iStoma → **Agendă → Program medici**
2. Pentru fiecare medic, adaugă program:
   - **Zilele**: Luni-Vineri (sau zilele când lucrează)
   - **Ora început**: 08:00
   - **Ora sfârșit**: 21:00
   - **Sediul**: Selectează sediul (ex: SUPERSMILE SIB)
   - **Cabinetul**: Selectează cabinetul (Cabinet 1 sau 2)
   - **Salvează**

#### Pasul 3: Verifică că programul este activ
- Programul trebuie să fie **activ** (nu suspendat)
- Trebuie să acopere data pentru care testezi (28.01.2026)

### 3. **Testează din nou**

După configurare, testează din nou:

#### Test GetMedici:
```
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetMedici?pCheie=CHEIA_TA
```
**Așteptat**: XML cu `<ArrayOfMedicAPIModel>` care conține medici, nu `i:nil="true"`

#### Test GetListaIntervaleActivitate:
```
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetListaIntervaleActivitate?pCheie=CHEIA_TA&pDataInceputZZLLAAAA=28012026&pDataSfarsitZZLLAAAA=28012026&pOraInceput=08:00&pOraFinal=21:00&pListaIdMedici=2,3,4,5&pIdSediu=3
```
**Așteptat**: XML cu `<ArrayOfIntervalCabinetAPIModel>` care conține intervale, nu `i:nil="true"`

### 4. **Test direct AdaugaProgramare** (chiar dacă GetListaIntervaleActivitate returnează null)

Poți testa direct programarea pentru a vedea dacă medicii au program definit:

```bash
curl -X POST https://supersmilesib.digitalclinic.ro/api/PacientAPI/AdaugaProgramare \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "pCheie=CHEIA_TA" \
  -d "pNumeCompletPacient=Test Nume" \
  -d "pTelefonPacient=40712345678" \
  -d "pAdresaMailPacient=" \
  -d "pDataDDMMYYYYHHMM=280120261030" \
  -d "pDurataInMinute=30" \
  -d "pIdSpecialist=2" \
  -d "pIdCabinet=1" \
  -d "pCategorie=Consultatie" \
  -d "pObservatii=Test"
```

**Răspuns așteptat**: `"13"` sau `<string>13</string>` pentru succes

**Dacă primești eroare 500**:
- Medicul (ID=2 = PAVEL) nu are program definit pentru 28.01.2026 la ora 10:30
- Sau cabinetul (ID=1) nu este asociat medicului
- Sau medicul nu lucrează în intervalul 08:00-21:00 în ziua respectivă

## ⚠️ Notă importantă

**Botul va funcționa și cu fallback-uri** (sloturi sintetice), dar:
- Dacă `GetListaIntervaleActivitate` returnează null, botul generează sloturi sintetice
- Când încearcă să programeze, **poate să dea eroare** dacă medicii nu au program definit în iStoma
- **Soluția corectă**: Configurează programul medicilor în iStoma pentru ca API-ul să returneze sloturi reale

## 📋 Checklist rapid

- [ ] Toți medicii au "www activ" setat
- [ ] Cheia API este corectă în `.env`
- [ ] Act adițional "Mobile pacient view" este activat
- [ ] Fiecare medic este asociat la un sediu (ex: ID=3)
- [ ] Fiecare medic este asociat la un cabinet (ID=1 sau 2)
- [ ] Fiecare medic are program de lucru definit (08:00-21:00)
- [ ] Programul este activ pentru data testată (28.01.2026)
- [ ] Testat GetMedici → returnează medici (nu null)
- [ ] Testat GetListaIntervaleActivitate → returnează intervale (nu null)
- [ ] Testat AdaugaProgramare → returnează "13" (succes)
