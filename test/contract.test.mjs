import { config } from "dotenv";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import specmatic from "specmatic";
import { GenericContainer, Wait } from "testcontainers";
import { getApp, startAppServer, stopAppServer } from "./util/app.server.js";

const TEST_TIMEOUT_MS = 10 * 60 * 1000;
const REPORT_DUMP_TIMEOUT_MS = 30 * 1000;
const KAFKA_API_SERVER = "http://localhost:9999";
const KAFKA_REPORTS_HOST_DIR = path.resolve("./build/reports/specmatic");
describe("Contract Tests", () => {
    /**
     * @type {any}
     */
    let appServer;
    /**
     * @type {import("testcontainers").StartedTestContainer}
     */
    let specmaticKafkaContainer;
    /**
     * @type {import("specmatic/dist/core/index.js").Stub}
     */
    let httpStub;

    beforeAll(async () => {
        config();
        const excludedEndpoints = "'/health'";
        process.env.FILTER = `PATH!=${excludedEndpoints}`;
        appServer = await startAppServer(process.env.APP_PORT);
        httpStub = await specmatic.startHttpStub(process.env.HTTP_STUB_HOST, Number.parseInt(process.env.HTTP_STUB_PORT || "8090"));
        specmaticKafkaContainer = await new GenericContainer("specmatic/enterprise")
            .withBindMounts([
                { source: path.resolve("specmatic.yaml"), target: "/usr/src/app/specmatic.yaml" },
                { source: KAFKA_REPORTS_HOST_DIR, target: "/usr/src/app/build/reports/specmatic" },
            ])
            .withCommand(["mock"])
            .withExposedPorts({ host: 9092, container: 9092 })
            .withExposedPorts({ host: 9999, container: 9999 })
            .withLogConsumer(stream => {
                stream.on("data", process.stdout.write.bind(process.stdout));
                stream.on("err", process.stderr.write.bind(process.stderr));
                stream.on("end", () => process.stdout.write("Specmatic mock stopped"));
            })
            .withWaitStrategy(Wait.forLogMessage(/AsyncMock has started/i))
            .start();
        await setupExpectations(httpStub.url, KAFKA_API_SERVER);
    }, TEST_TIMEOUT_MS);

    afterAll(async () => {
        await stopAppServer(appServer);
        await specmatic.stopHttpStub(httpStub);
        await dumpAsyncReports();
        console.log("Stopping Specmatic Kafka container");
        await specmaticKafkaContainer.stop();
        console.log("Specmatic Kafka container stopped");
    }, TEST_TIMEOUT_MS);

    test("Run tests and verify expectations", async () => {
        await specmatic.testWithApiCoverage(getApp(), process.env.APP_HOST, Number.parseInt(process.env.APP_PORT || "8080"));
        const response = await fetch(`${KAFKA_API_SERVER}/_specmatic/expectations/verification_status`)
        const responseData = await response.json();
        const isSuccess = responseData.success || false;
        if (typeof isSuccess === "boolean") {
            expect(isSuccess, "Expectations verification failed. The expectations may not be set up correctly.").toBe(true);
        } else {
            const errors = responseData.errors || ["Something went wrong"];
            expect(errors, `Expectations were not met. Reason(s):\n${errors.join("\n")}`).toEqual([]);
        }
    }, TEST_TIMEOUT_MS);
});


/**
 * Sets up expectations for both HTTP and Kafka
 * @param {string} httpStubUrl - URL of the HTTP stub server
 * @param {string} kafkaMockUrl - URL of the Kafka mock server
 */
async function setupExpectations(httpStubUrl, kafkaMockUrl) {
    await setupHttpExpectations(httpStubUrl);
    await setupKafkaExpectations(kafkaMockUrl);
}

/**
 * Sets up HTTP expectations from the JSON files in the test-resources folder
 * @param {string} httpStubUrl - URL of the HTTP stub server
 */
async function setupHttpExpectations(httpStubUrl) {
    const test_folder = "test-resources";
    readdirSync(test_folder).map(
        async (fileName) => await specmatic.setExpectations(path.join(test_folder, fileName), httpStubUrl)
    );
}

/**
 * Sets up Kafka expectations
 * @param {string} kafkaMockUrl - URL of the Kafka mock server
 */
async function setupKafkaExpectations(kafkaMockUrl) {
    const response = await fetch(`${kafkaMockUrl}/_specmatic/expectations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectations: [{ topic: "product-queries", count: 2 }] }),
    })
    if (!response.ok) throw new Error(await response.text());
}

async function dumpAsyncReports() {
    console.log("Dumping kafka mock reports..");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REPORT_DUMP_TIMEOUT_MS);
    try {
        const response = await fetch(`${KAFKA_API_SERVER}/stop`, {
            method: "POST",
            body: "",
            signal: controller.signal,
        });
        if (response.ok) {
            console.log("Reports dumped successfully!");
        } else {
            console.log("Error occurred while dumping the reports");
        }
    } catch (error) {
        if (error.name === "AbortError") {
            console.log(`Dumping kafka mock reports timed out after ${REPORT_DUMP_TIMEOUT_MS}ms. Proceeding with teardown.`);
        } else {
            console.log("Error occurred while dumping the reports", error);
        }
    } finally {
        clearTimeout(timeout);
    }
}
