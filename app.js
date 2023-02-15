const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
let db = null;

const initializationDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error ${e.message}`);
    process.exit(1);
  }
};
initializationDBAndServer();
const convertDbObjToRespObj = (eachObject) => {
  return {
    stateId: eachObject.state_id,
    stateName: eachObject.state_name,
    population: eachObject.population,
  };
};
const convertDbObjToRespObjDistrict = (districtObject) => {
  return {
    districtId: districtObject.district_id,
    districtName: districtObject.district_name,
    stateId: districtObject.state_id,
    cases: districtObject.cases,
    cured: districtObject.cured,
    active: districtObject.active,
    deaths: districtObject.deaths,
  };
};

const authentication = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let token;
  if (authHeader !== undefined) {
    token = authHeader.split(" ")[1];
  }
  if (token === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(token, "MY_KEY", async (error, user) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const checkUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(checkUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const checkPassword = await bcrypt.compare(password, dbUser.password);
    if (checkPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "MY_KEY");
      response.send({ jwtToken: jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authentication, async (request, response) => {
  const getStatesQuery = `
    SELECT 
    * FROM state
    ORDER BY state_id;`;
  const statesDbArray = await db.all(getStatesQuery);
  response.send(
    statesDbArray.map((eachState) => convertDbObjToRespObj(eachState))
  );
});

app.get("/states/:stateId/", authentication, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
    SELECT 
    *
    FROM state
    WHERE state_id=${stateId};`;
  const stateDbArray = await db.get(getStateQuery);
  response.send(convertDbObjToRespObj(stateDbArray));
});

app.post("/districts/", authentication, async (request, response) => {
  const { districtName, stateId, cases, cured, active, deaths } = request.body;
  const postQuery = `
    INSERT 
    INTO district (district_name,state_id,cases,cured,active,deaths)
    VALUES (
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths}
    );`;
  await db.run(postQuery);
  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
    SELECT 
    *
    FROM 
    district 
    WHERE district_id=${districtId};`;
    const districtDbArray = await db.get(getDistrictQuery);
    response.send(convertDbObjToRespObjDistrict(districtDbArray));
  }
);

app.delete(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
    DELETE FROM district
    WHERE district_id=${districtId};`;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authentication,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
    UPDATE 
    district 
    SET 
    district_name='${districtName}',
    state_id=${stateId},
    cases=${cases},
    cured=${cured},
    active=${active},
    deaths=${deaths}
    WHERE district_id=${districtId};`;
    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authentication,
  async (request, response) => {
    const { stateId } = request.params;
    const getStatsQuery = `
    SELECT 
    SUM(cases),SUM(cured),SUM(active),SUM(deaths)
    FROM 
    district
    WHERE state_id=${stateId};`;
    const statsResponse = await db.get(getStatsQuery);
    response.send({
      totalCases: statsResponse["SUM(cases)"],
      totalCured: statsResponse["SUM(cured)"],
      totalActive: statsResponse["SUM(active)"],
      totalDeaths: statsResponse["SUM(deaths)"],
    });
  }
);
module.exports = app;
