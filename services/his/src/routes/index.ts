import { Router } from "express";
import { FacilityController, PatientController, PersonController, PractitionerController } from "../controllers/index.js";
import { tenantContext } from "../middleware/tenantContext.js";
import type { FacilityService, PatientService, PersonService, PractitionerService } from "../application/index.js";

export interface HisServices {
  personService: PersonService;
  patientService: PatientService;
  practitionerService: PractitionerService;
  facilityService: FacilityService;
}

export function createHisRouter(services: HisServices): Router {
  const router = Router();
  const person = new PersonController(services.personService);
  const patient = new PatientController(services.patientService);
  const practitioner = new PractitionerController(services.practitionerService);
  const facility = new FacilityController(services.facilityService);

  router.use(tenantContext);

  router.get("/persons/:id", person.get);
  router.post("/persons", person.create);
  router.put("/persons/:id", person.update);

  router.get("/patients/:id", patient.get);
  router.post("/patients", patient.create);
  router.put("/patients/:id", patient.update);

  router.get("/practitioners/:id", practitioner.get);
  router.post("/practitioners", practitioner.create);
  router.put("/practitioners/:id", practitioner.update);

  router.get("/facilities/:id", facility.get);
  router.post("/facilities", facility.create);
  router.put("/facilities/:id", facility.update);

  return router;
}
