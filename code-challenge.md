# SleekFlow Software Engineer Project

## Objective
Develop a TODO list web application that allows users to manage their TODOs. 

This project evaluates your ability to interpret requirements, make architectural decisions, prioritize effectively, and deliver a working solution with clear reasoning behind your choices.

---

## Project Overview

### Core Features (Required)
Build a TODO list application with both a backend API and a simple web UI.

#### 1. TODO Management
Each TODO has:
* **Unique ID**
* **Name**
* **Description**
* **Due Date**
* **Status:** Not Started, In Progress, Completed, Archived
* **Priority:** (e.g., Low, Medium, High)

Standard CRUD operations (create, read, update, delete) for TODOs.

#### 2. Recurring Tasks
* TODOs can recur on a schedule: daily, weekly, monthly, or custom.
* When a recurring TODO is marked as completed, the next occurrence should be created automatically based on its schedule.

#### 3. Task Dependencies
* A TODO can depend on one or more other TODOs.
* A dependent task cannot be moved to "In Progress" until all of its dependencies are "Completed."

#### 4. Filtering and Sorting
* **Filter by:** status, priority, due date, dependency status (blocked / unblocked)
* **Sort by:** due date, priority, status, name

#### 5. Web UI
A simple, functional web interface for managing TODOs—creating, editing, deleting, filtering, and sorting. The UI does not need to be visually polished; functional and usable is sufficient.

---

### Non-Functional Requirements
* The API should support multiple users accessing the same TODO list concurrently.
* Data should not be permanently lost when a TODO is deleted.
* The system should handle a TODO list with 10,000+ items without degrading user experience.

---

### Nice-to-Have Features
*These are optional. Prioritize core features first.*

* User authentication and registration
* Real-time updates across browser tabs or users
* Bulk operations (e.g., complete all tasks in a group)
* DevOps setup (e.g., Docker, CI/CD)
* Architecture diagram
* Any other improvements or features you see fit

---

## Deliverables

1. **GitHub Repository:** A GitHub repository containing your source code.
2. **README:** A README with instructions for setup and local development.
3. **API Documentation:** OpenAPI/Swagger, Postman collection, or equivalent.
4. **Decision Log (1–2 pages, included in the repository):**
   * How you interpreted ambiguous or underspecified requirements, and the reasoning behind your interpretation.
   * Key architectural decisions and the trade-offs you considered.
   * What you chose **NOT** to build and why.
   * What you would do differently with more time.
5. **Live Demo:** Be prepared to present a live demo of your application during the upcoming interview, followed by a discussion of your decisions. Please ensure you have your development environment ready and the application running locally before the interview.

---

## Guidelines

* **Backend:** Use any modern programming language and framework (e.g., ASP.NET Core, Python with Flask or Django, Node.js with Express, Java with Spring Boot, Go, etc.).
* **Frontend:** Choose any suitable front-end framework or library (e.g., React, Angular, Vue.js, etc.).
* **Database:** Choose a suitable database (e.g., PostgreSQL, MongoDB, MySQL, MSSQL, etc.).
* **Quality & Verification:** Implement error handling and input validation for API requests. Write tests for core functionality (unit and/or integration). Ensure the application can be easily run and tested locally.
* **AI Tools:** You are welcome to use AI coding tools (e.g., Copilot, Cursor, ChatGPT). If you do, you may optionally include your AI session transcripts as supplementary material — this is not required but welcomed.

---

## A Note on Scope

This project is designed to have more requirements than you may be able to fully implement in a reasonable timeframe. **This is intentional.** 

We are not expecting you to build everything. How you prioritize, what you choose to focus on, and how you communicate those decisions in your decision log are all part of the evaluation.

---

## What We're Evaluating

* **Requirement Interpretation:** Did you identify areas where requirements are ambiguous or underspecified? How did you resolve them?
* **Planning and Prioritization:** Did you scope the work sensibly? Did you focus on core features before nice-to-haves?
* **Technical Decisions:** Are your architectural choices well-reasoned? Can you articulate the trade-offs?
* **Code Quality:** Is the code well-structured, testable, and maintainable?
* **Verification:** Do your tests cover meaningful scenarios, including edge cases?
* **Communication:** Is your decision log clear and well-reasoned? Can you walk us through your choices in the live demo?