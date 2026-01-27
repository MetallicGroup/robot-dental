# Cum să configurezi corect programul medicilor în iStoma

## ❌ Ce NU e bine în configurarea actuală

Din imagine văd că ai configurat programul pentru **"Cabinet 1"** (entitate), dar API-ul `GetListaIntervaleActivitate` caută programul pentru **medici individuali**.

## ✅ Ce trebuie să faci

### Pasul 1: Deschide programul pentru fiecare medic individual

1. Deschide iStoma → **Resurse umane → Echipa**
2. **NU** click pe "Cabinet 1" sau "Cabinet 2"
3. Click pe **fiecare medic individual**:
   - **Dr. PAVEL Iulia** (ID=2)
   - **Dr. UDECI Madalina** (ID=3)
   - **Dr. COROIAN Andrei** (ID=4)
   - **Dr. CRETIU Raul** (ID=5)

### Pasul 2: Configurează programul pentru fiecare medic

Pentru fiecare medic (PAVEL, UDECI, COROIAN, CRETIU):

1. Click pe medic → **Editare**
2. Tab **"Program de lucru"** (Work Schedule)
3. Sub-tab **"Program de lucru"** (nu "Excepții")
4. Configurează:
   - **Data**: Selectează o dată din săptămâna curentă (ex: 28.01.2026)
   - **Săptămâna impară** și **Săptămâna pară**:
     - **Luni**: 08:00 - 21:00
     - **Marți**: 08:00 - 21:00
     - **Miercuri**: 08:00 - 21:00
     - **Joi**: 08:00 - 21:00
     - **Vineri**: 08:00 - 21:00
     - **Sâmbătă**: (opțional, dacă lucrează)
     - **Duminică**: (opțional, dacă lucrează)
   
   **IMPORTANT**: 
   - **NU** folosi 00:00-24:00 (nu e realist)
   - Folosește **08:00-21:00** (conform programului tău)
   - Asigură-te că programul este **activ** (nu suspendat)

5. **Asociază la sediu și cabinet**:
   - În același tab sau în alt tab, asigură-te că medicul este asociat la:
     - **Sediul** unde lucrează (ex: SUPERSMILE SIB, ID=2 sau 3)
     - **Cabinetul** unde lucrează (Cabinet 1, ID=1 sau Cabinet 2, ID=2)

6. **Salvează** pentru fiecare medic

### Pasul 3: Verifică că programul este activ

- Programul trebuie să fie **activ** (nu suspendat)
- Trebuie să acopere data pentru care testezi (28.01.2026)
- Trebuie să fie asociat la sediu și cabinet

## 🔍 Cum să verifici

După configurare, testează din nou:

```
https://supersmilesib.digitalclinic.ro/api/PacientAPI/GetListaIntervaleActivitate?pCheie=CHEIA_TA&pDataInceputZZLLAAAA=28012026&pDataSfarsitZZLLAAAA=28012026&pOraInceput=08:00&pOraFinal=21:00&pListaIdMedici=2,3,4,5&pIdSediu=2
```

**Așteptat**: XML cu `<ArrayOfIntervalCabinetAPIModel>` care conține intervale, nu `i:nil="true"`

## ⚠️ Diferența importantă

- **❌ Greșit**: Program setat pentru "Cabinet 1" (entitate)
- **✅ Corect**: Program setat pentru fiecare medic individual (PAVEL, UDECI, COROIAN, CRETIU)

API-ul caută programul medicilor individuali, nu al cabinetului!
