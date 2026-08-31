-- Migração de DADOS (o schema não muda): os cadastros AUTOMÁTICOS de
-- serventia da primeira leva saíram sem validação de município e geraram
-- lixo ("Oficial de Registro de Imóveis de Americana suscitou a
-- pressente", cidade truncada "São"). Remove TODO cadastro fora da
-- semente: as exigências apontadas voltam a cartório nulo (FK ON DELETE
-- SET NULL) e a passada reatribuirCartorios do worker recadastra com o
-- município validado pela base real dos 5.587.

DELETE FROM "jurimetria_cartorios" WHERE "id" NOT IN (
  'ri-sp-01','ri-sp-02','ri-sp-03','ri-sp-04','ri-sp-05','ri-sp-06',
  'ri-sp-07','ri-sp-08','ri-sp-09','ri-sp-10','ri-sp-11','ri-sp-12',
  'ri-sp-13','ri-sp-14','ri-sp-15','ri-sp-16','ri-sp-17','ri-sp-18',
  'ri-guarulhos-01','ri-guarulhos-02','ri-itaquaquecetuba'
);
